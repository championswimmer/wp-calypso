/** @format */
/**
 * Internal dependencies
 */
import { HTTP_DATA_REQUEST, HTTP_DATA_TICK } from 'state/action-types';
import { dispatchRequestEx } from 'state/data-layer/wpcom-http/utils';

export const httpData = new Map();

const empty = Object.freeze( {
	state: 'uninitialized',
	data: undefined,
	error: undefined,
	lastUpdated: -Infinity,
	pendingSince: undefined,
} );

export const getHttpData = id => httpData.get( id ) || empty;

export const update = ( id, state, data ) => {
	const lastUpdated = Date.now();
	const item = httpData.get( id );
	const hasItem = item !== undefined;

	// We could have left out the keys for
	// the previous properties if they didn't
	// exist but I wanted to make sure we can
	// get our hidden classes to optimize here.
	switch ( state ) {
		case 'failure':
			return httpData.set( id, {
				state,
				data: hasItem ? item.data : undefined,
				error: data,
				lastUpdated: hasItem ? item.lastUpdated : -Infinity,
				pendingSince: undefined,
			} );

		case 'pending':
			return httpData.set( id, {
				state,
				data: hasItem ? item.data : undefined,
				error: undefined,
				lastUpdated: hasItem ? item.lastUpdated : -Infinity,
				pendingSince: lastUpdated,
			} );

		case 'success':
			return httpData.set( id, {
				state,
				data,
				error: undefined,
				lastUpdated,
				pendingSince: undefined,
			} );
	}
};

const fetch = action => {
	update( action.id, 'pending' );

	return [
		{
			...action.fetch,
			onSuccess: action,
			onFailure: action,
			onProgress: action,
		},
		{ type: HTTP_DATA_TICK },
	];
};

const onError = ( action, error ) => {
	update( action.id, 'failure', error );

	return { type: HTTP_DATA_TICK };
};

/**
 * Transforms API response data into storable data
 * Returns pairs of data ids and data plus an error indicator
 *
 * [ error?, [ [ id, data ], [ id, data ], … ] ]
 *
 * @example:
 *   --input--
 *   { data: { sites: {
 *     14: { is_active: true, name: 'foo' },
 *     19: { is_active: false, name: 'bar' }
 *   } } }
 *
 *   --output--
 *   [ [ 'site-names-14', 'foo' ] ]
 *
 * @param {*} data input data from API response
 * @param {function} fromApi transforms API response data
 * @return {Array<boolean, Array<Array<string, *>>>} output data to store
 */
const parseResponse = ( data, fromApi ) => {
	try {
		return [ undefined, fromApi( data ) ];
	} catch ( error ) {
		return [ error, undefined ];
	}
};

const onSuccess = ( action, apiData ) => {
	const fromApi = 'function' === typeof action.fromApi && action.fromApi();
	const [ error, data ] = fromApi ? parseResponse( apiData, fromApi ) : [ undefined, [] ];

	if ( undefined !== error ) {
		return onError( action, error );
	}

	update( action.id, 'success', apiData );
	data.forEach( ( [ id, resource ] ) => update( id, 'success', resource ) );

	return { type: HTTP_DATA_TICK };
};

export default {
	[ HTTP_DATA_REQUEST ]: [
		dispatchRequestEx( {
			fetch,
			onSuccess,
			onError,
		} ),
	],
};

export const reducer = ( state = 0, { type } ) => ( HTTP_DATA_TICK === type ? state + 1 : state );

let dispatch;
let dispatchQueue = [];

export const enhancer = next => ( ...args ) => {
	const store = next( ...args );

	dispatch = store.dispatch;

	// allow rest of enhancers and middleware
	// to load then dispatch all queued actions
	// delay picked to allow for initialization
	// to occur while remaining "instant"
	setTimeout( () => {
		dispatchQueue.forEach( dispatch );
		dispatchQueue = [];
	}, 50 );

	return store;
};

/**
 * Fetches data from a fetchable action
 *
 * @param {string} requestId uniquely identifies the request or request type
 * @param {function|object} fetchAction action that when dispatched will request the data (may be wrapped in a lazy thunk)
 * @param {?function} fromApi when called produces a function that validates and transforms API data into Calypso data
 * @param {?number} freshness indicates how many ms stale data is allowed to be before refetching
 * @return {*} stored data container for request
 */
export const requestHttpData = ( requestId, fetchAction, { fromApi, freshness = Infinity } ) => {
	const data = getHttpData( requestId );
	const { state, lastUpdated } = data;

	if (
		'uninitialized' === state ||
		( 'pending' !== state && Date.now() - lastUpdated > freshness )
	) {
		if ( 'development' === process.env.NODE_ENV && 'function' !== typeof dispatch ) {
			throw new Error( 'Cannot use HTTP data without injecting Redux store enhancer!' );
		}

		const action = {
			type: HTTP_DATA_REQUEST,
			id: requestId,
			fetch: 'function' === typeof fetchAction ? fetchAction() : fetchAction,
			fromApi: 'function' === typeof fromApi ? fromApi : () => a => a,
		};

		dispatch ? dispatch( action ) : dispatchQueue.push( action );
	}

	return data;
};

if ( 'object' === typeof window && window.app && window.app.isDebug ) {
	window.getHttpData = getHttpData;
	window.httpData = httpData;
	window.requestHttpData = requestHttpData;
}
