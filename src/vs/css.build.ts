/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

namespace CSSBuildLoaderPlugin {

	interface ICSSPluginConfig {
		inlineResources?: boolean | 'base64';
		inlineResourcesLimit?: number;
	}

	// This file gets compiled also with the standalone editor,
	// so we cannot depend on types from node.d.ts
	interface INodeFS {
		readFileSync(path: string, encoding: 'utf8'): string;
		readFileSync(path: string): INodeBuffer;
	}
	interface INodeBuffer {
		length: number;
		toString(encoding?: 'base64'): string;
	}
	interface INodePath {
		dirname(p: string): string;
		join(...paths: string[]): string;
	}

	const fs: INodeFS = (<any>require).nodeRequire('fs');
	const path: INodePath = (<any>require).nodeRequire('path');

	interface ICSSEntryPointData {
		moduleName: string;
		contents: string;
		fsPath: string;
	}

	export class CSSPlugin implements AMDLoader.ILoaderPlugin {

		private inlineResources: boolean | 'base64' = false;
		private inlineResourcesLimit: number = 5000;

		private readonly _contentsMap: { [moduleName: string]: string } = {};
		private readonly _pathMap: { [moduleName: string]: string } = {};
		private readonly _entryPoints: { [entryPoint: string]: ICSSEntryPointData[] } = {};
		private readonly _inlinedResources: string[] = [];

		public load(name: string, req: AMDLoader.IRelativeRequire, load: AMDLoader.IPluginLoadCallback, config: AMDLoader.IConfigurationOptions): void {
			config = config || {};
			const myConfig = <ICSSPluginConfig>(config['vs/css'] || {});
			this.inlineResources = (typeof myConfig.inlineResources === 'undefined' ? false : myConfig.inlineResources);
			this.inlineResourcesLimit = (myConfig.inlineResourcesLimit || 5000);
			const cssUrl = req.toUrl(name + '.css');
			let contents = fs.readFileSync(cssUrl, 'utf8');
			if (contents.charCodeAt(0) === 65279 /* BOM */) {
				// Remove BOM
				contents = contents.substring(1);
			}
			if (config.isBuild) {
				this._contentsMap[name] = contents;
				this._pathMap[name] = cssUrl;
			}
			load({});
		}

		public write(pluginName: string, moduleName: string, write: AMDLoader.IPluginWriteCallback): void {
			const entryPoint = write.getEntryPoint();

			this._entryPoints[entryPoint] = this._entryPoints[entryPoint] || [];
			this._entryPoints[entryPoint].push({
				moduleName: moduleName,
				contents: this._contentsMap[moduleName],
				fsPath: this._pathMap[moduleName],
			});

			write.asModule(pluginName + '!' + moduleName,
				'define([\'vs/css!' + entryPoint + '\'], {});'
			);
		}

		public writeFile(pluginName: string, moduleName: string, req: AMDLoader.IRelativeRequire, write: AMDLoader.IPluginWriteFileCallback, config: AMDLoader.IConfigurationOptions): void {
			if (this._entryPoints && this._entryPoints.hasOwnProperty(moduleName)) {
				const fileName = req.toUrl(moduleName + '.css');
				const contents = [
					'/*---------------------------------------------------------',
					' * Copyright (c) Microsoft Corporation. All rights reserved.',
					' *--------------------------------------------------------*/'
				],
					entries = this._entryPoints[moduleName];
				for (let i = 0; i < entries.length; i++) {
					if (this.inlineResources) {
						contents.push(this._rewriteOrInlineUrls(entries[i].fsPath, entries[i].moduleName, moduleName, entries[i].contents, this.inlineResources === 'base64', this.inlineResourcesLimit));
					} else {
						contents.push(this._rewriteUrls(entries[i].moduleName, moduleName, entries[i].contents));
					}
				}
				write(fileName, contents.join('\r\n'));
			}
		}

		public getInlinedResources(): string[] {
			return this._inlinedResources || [];
		}

		private _rewriteOrInlineUrls(originalFileFSPath: string, originalFile: string, newFile: string, contents: string, forceBase64: boolean, inlineByteLimit: number): string {
			return Utilities.replaceURL(contents, (url) => {
				if (/\.(svg|png)$/.test(url)) {
					const fsPath = path.join(path.dirname(originalFileFSPath), url);
					const fileContents = fs.readFileSync(fsPath);

					if (fileContents.length < inlineByteLimit) {
						const normalizedFSPath = fsPath.replace(/\\/g, '/');
						this._inlinedResources.push(normalizedFSPath);

						const MIME = /\.svg$/.test(url) ? 'image/svg+xml' : 'image/png';
						let DATA = ';base64,' + fileContents.toString('base64');

						if (!forceBase64 && /\.svg$/.test(url)) {
							// .svg => url encode as explained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
							const newText = fileContents.toString()
								.replace(/"/g, '\'')
								.replace(/%/g, '%25')
								.replace(/</g, '%3C')
								.replace(/>/g, '%3E')
								.replace(/&/g, '%26')
								.replace(/#/g, '%23')
								.replace(/\s+/g, ' ');
							const encodedData = ',' + newText;
							if (encodedData.length < DATA.length) {
								DATA = encodedData;
							}
						}
						return '"data:' + MIME + DATA + '"';
					}
				}

				const absoluteUrl = Utilities.joinPaths(Utilities.pathOf(originalFile), url);
				return Utilities.relativePath(newFile, absoluteUrl);
			});
		}

		private _rewriteUrls(originalFile: string, newFile: string, contents: string): string {
			return Utilities.replaceURL(contents, (url) => {
				const absoluteUrl = Utilities.joinPaths(Utilities.pathOf(originalFile), url);
				return Utilities.relativePath(newFile, absoluteUrl);
			});
		}
	}

	export class Utilities {

		public static startsWith(haystack: string, needle: string): boolean {
			return haystack.length >= needle.length && haystack.substr(0, needle.length) === needle;
		}

		/**
		 * Find the path of a file.
		 */
		public static pathOf(filename: string): string {
			const lastSlash = filename.lastIndexOf('/');
			if (lastSlash !== -1) {
				return filename.substr(0, lastSlash + 1);
			} else {
				return '';
			}
		}

		/**
		 * A conceptual a + b for paths.
		 * Takes into account if `a` contains a protocol.
		 * Also normalizes the result: e.g.: a/b/ + ../c => a/c
		 */
		public static joinPaths(a: string, b: string): string {

			function findSlashIndexAfterPrefix(haystack: string, prefix: string): number {
				if (Utilities.startsWith(haystack, prefix)) {
					return Math.max(prefix.length, haystack.indexOf('/', prefix.length));
				}
				return 0;
			}

			let aPathStartIndex = 0;
			aPathStartIndex = aPathStartIndex || findSlashIndexAfterPrefix(a, '//');
			aPathStartIndex = aPathStartIndex || findSlashIndexAfterPrefix(a, 'http://');
			aPathStartIndex = aPathStartIndex || findSlashIndexAfterPrefix(a, 'https://');

			function pushPiece(pieces: string[], piece: string): void {
				if (piece === './') {
					// Ignore
					return;
				}
				if (piece === '../') {
					const prevPiece = (pieces.length > 0 ? pieces[pieces.length - 1] : null);
					if (prevPiece && prevPiece === '/') {
						// Ignore
						return;
					}
					if (prevPiece && prevPiece !== '../') {
						// Pop
						pieces.pop();
						return;
					}
				}
				// Push
				pieces.push(piece);
			}

			function push(pieces: string[], path: string): void {
				while (path.length > 0) {
					const slashIndex = path.indexOf('/');
					const piece = (slashIndex >= 0 ? path.substring(0, slashIndex + 1) : path);
					path = (slashIndex >= 0 ? path.substring(slashIndex + 1) : '');
					pushPiece(pieces, piece);
				}
			}

			let pieces: string[] = [];
			push(pieces, a.substr(aPathStartIndex));
			if (b.length > 0 && b.charAt(0) === '/') {
				pieces = [];
			}
			push(pieces, b);

			return a.substring(0, aPathStartIndex) + pieces.join('');
		}

		public static commonPrefix(str1: string, str2: string): string {
			const len = Math.min(str1.length, str2.length);
			for (let i = 0; i < len; i++) {
				if (str1.charCodeAt(i) !== str2.charCodeAt(i)) {
					return str1.substring(0, i);
				}
			}
			return str1.substring(0, len);
		}

		public static commonFolderPrefix(fromPath: string, toPath: string): string {
			const prefix = Utilities.commonPrefix(fromPath, toPath);
			const slashIndex = prefix.lastIndexOf('/');
			if (slashIndex === -1) {
				return '';
			}
			return prefix.substring(0, slashIndex + 1);
		}

		public static relativePath(fromPath: string, toPath: string): string {
			if (Utilities.startsWith(toPath, '/') || Utilities.startsWith(toPath, 'http://') || Utilities.startsWith(toPath, 'https://')) {
				return toPath;
			}

			// Ignore common folder prefix
			const prefix = Utilities.commonFolderPrefix(fromPath, toPath);
			fromPath = fromPath.substr(prefix.length);
			toPath = toPath.substr(prefix.length);

			const upCount = fromPath.split('/').length;
			let result = '';
			for (let i = 1; i < upCount; i++) {
				result += '../';
			}
			return result + toPath;
		}

		public static replaceURL(contents: string, replacer: (url: string) => string): string {
			// Use ")" as the terminator as quotes are oftentimes not used at all
			return contents.replace(/url\(\s*([^\)]+)\s*\)?/g, (_: string, ...matches: string[]) => {
				let url = matches[0];
				// Eliminate starting quotes (the initial whitespace is not captured)
				if (url.charAt(0) === '"' || url.charAt(0) === '\'') {
					url = url.substring(1);
				}
				// The ending whitespace is captured
				while (url.length > 0 && (url.charAt(url.length - 1) === ' ' || url.charAt(url.length - 1) === '\t')) {
					url = url.substring(0, url.length - 1);
				}
				// Eliminate ending quotes
				if (url.charAt(url.length - 1) === '"' || url.charAt(url.length - 1) === '\'') {
					url = url.substring(0, url.length - 1);
				}

				if (!Utilities.startsWith(url, 'data:') && !Utilities.startsWith(url, 'http://') && !Utilities.startsWith(url, 'https://')) {
					url = replacer(url);
				}

				return 'url(' + url + ')';
			});
		}
	}

	define('vs/css', new CSSPlugin());
}
