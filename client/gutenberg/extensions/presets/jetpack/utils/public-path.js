/** @format */
/* exported __webpack_public_path__ */
/* global __webpack_public_path__ */

/**
 * Dynamically set WebPack's publicPath so that split assets can be found.
 * @see https://webpack.js.org/guides/public-path/#on-the-fly
 */

if ( typeof window === 'object' && window.JETPACK_BLOCK_ASSETS_BASE_URL ) {
	__webpack_public_path__ = window.JETPACK_BLOCK_ASSETS_BASE_URL;
}
