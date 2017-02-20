(function (define) {
	'use strict';

	/** 
	 * @module CurrencyConverter
	 * @description JavaScript currency converter
	 * @version 1.0.0
	 */
	define(['jquery'], function ($) {

		return (function () {

			var HOURS = 60 * 60 * 1000,
				SETTINGS = {
					RATES_VALIDITY_HOURS : HOURS * 24,
					CACHE_TO_LOCAL_STORAGE : true,
					LOCAL_STORAGE_VARIABLE_NAME : 'JS_CURRENCY_CONVERTER_CACHED_RATES',
					API_URL : 'http://free.currencyconverterapi.com/api/v3/convert?compact=y&q=',
				},
				CACHED_RATES = SETTINGS.CACHE_TO_LOCAL_STORAGE ? (getFromLocalStorage(SETTINGS.LOCAL_STORAGE_VARIABLE_NAME) || {}) : {},
				CONVERSIONS_IN_PROGRESS = {};



			var CurrencyConverter = {};

			CurrencyConverter.config = config;
			CurrencyConverter.getRate = getRate;
			CurrencyConverter.fetchQuote = fetchQuote;
			CurrencyConverter.convertAmount = convertAmount;

			return CurrencyConverter;



		// ======================== Exposed Functions ========================

			/**
			* @function convertAmount
			* @description Converts given amount from given currency to given currency
			* @param {number} amount Amount of money converting
			* @param {string} fromCurrency Currency converting from
			* @param {string} toCurrency Currency converting to
			* @return {Promise<conversionObject>} Promise to the conversionObject
			* @property {number} conversionObject.value converted amount
			* @property {number} conversionObject.rate conversion rate
			* @property {boolean} conversionObject.expired is the rate expired (considering RATES_VALIDITY_HOURS)
			*/
			function convertAmount (amount, fromCurrency, toCurrency) {

				var deferred = $.Deferred();

				getRate(fromCurrency, toCurrency)
				.done(onSuccess)
				.fail(onError);

				return deferred.promise()	;

				function onSuccess (data) {
					data.value = amount * data.rate;
					deferred.resolve(data);
				}

				function onError (error) {
					deferred.reject(error);
				}

			}



			/**
			* @function fetchQuote
			* @description Returns conversion rate from the API
			* @param {string} fromCurrency Currency converting from
			* @param {string} toCurrency Currency converting to
			* @return {Promise<number>} Resolves to conversion rate number
			*/
			function fetchQuote (fromCurrency, toCurrency) {

				var deferred = $.Deferred();
				var query = toQuery(fromCurrency, toCurrency);

				// If the call for the same converesion is in progress, return the same promise
				var inProgressPromise = getConversionInProgress(query);

				if(inProgressPromise) {
					return inProgressPromise;
				}

				$.get(SETTINGS.API_URL + query)
				.done(onSuccess)
				.fail(onError)
				.always(onAlways);

				// cache the promise, in case it gets called while this one is in progress
				setConversionInProgress(query, deferred.promise());

				return deferred.promise()	;

				function onSuccess (response) {
					// cache the result
					cacheRate(query, response[query].val);
					deferred.resolve(response[query].val);
				}

				function onError (error) {
					deferred.reject(error);
				}

				function onAlways () {
					// dereference API call which was in progress
					setConversionInProgress(query, null);
				}

			}



			/**
			* @function getRate
			* @description Returns conversion rate. 
			* If the conversion rate is already available in the cache, and not expired, that rate is used. 
			* If the conversion rate is not available in the cache, API rate fetch is attempted.
			* If the rate is available in the cache but expired, API rate fetch is attempted.
			* If the rate is available in the cache and expired, and API rate fetch fails, expired rate is returned if available.
			* @param {string} fromCurrency Currency converting from
			* @param {string} toCurrency Currency converting to
			* @return {Promise<number>} Resolves to conversion rate number
			*/
			function getRate (fromCurrency, toCurrency) {

				var deferred = $.Deferred();
				var query = toQuery(fromCurrency, toCurrency);

				// if there' a non-expired rate in the cache, return it
				if(isRateValid(query)) {
					resolveRate(false, CACHED_RATES[query].value);
				}
				// otherwise fetch it from the api 
				else {
					fetchQuote(fromCurrency, toCurrency)
					.done(fetchOnSuccess)
					.fail(oldRateFallback);
				}

				return deferred.promise();

				function fetchOnSuccess (rate) {
					resolveRate(false, rate);
				}

				// if the api fails, try to return an expired rate as a failback
				function oldRateFallback (error) {

					// if rate is cached but expired, resolve old rate
					if(isRateCached(query)){
						resolveRate(true, CACHED_RATES[query].value);
					} else {
						deferred.reject(error);
					}

				}

				function resolveRate (isExpired, rateValue) {
					deferred.resolve({
						expired: isExpired,
						rate: rateValue
					});
				}

			}



			/**
			* @function config
			* @description Overrides default CurrencyConverter settings
			* @param {options} fromCurrency Currency converting from
			* @property {number} options.CACHE_TO_LOCAL_STORAGE Cache conversion rate to local storage, if available
			* @property {number} options.RATES_VALIDITY_HOURS Cached conversion rate validity in hours
			* @property {number} options.LOCAL_STORAGE_VARIABLE_NAME Local storage variable name for cached conversion rates object
			* @property {number} options.API_URL API Endpoint url
			*/
			function config (options) {
				if (isObject(options)) {
					SETTINGS = $.extend(SETTINGS, options);
				}
			}



		// ============================== HELPERS ==============================

			function setConversionInProgress (query, promise) {
				CONVERSIONS_IN_PROGRESS[query] = promise;
			}

			function getConversionInProgress (query) {
				return CONVERSIONS_IN_PROGRESS[query];
			}
			
			function toQuery (fromCurrency, toCurrency) {
				return (fromCurrency || '') + '_' + (toCurrency || '');
			}

			function isRateCached (queryCode) {
				return isObject(CACHED_RATES[queryCode]);
			}

			function isRateExpired (rate) {
				// if the rate is from local storage, then it's a string
				var compareDate = isString(rate.date) ? new Date(rate.date) : rate.date;
				return (new Date().getTime() - compareDate.getTime()) > SETTINGS.RATES_VALIDITY_HOURS;
			}

			function isRateValid (queryCode) {
				return isObject(CACHED_RATES[queryCode]) 
					&& !isRateExpired(CACHED_RATES[queryCode]);
			}

			function cacheRate (rateName, value) {
				CACHED_RATES[rateName] = {
					value: value,
					date: new Date()
				};
				if(SETTINGS.CACHE_TO_LOCAL_STORAGE) {
					saveToLocalStorage(SETTINGS.LOCAL_STORAGE_VARIABLE_NAME, CACHED_RATES);
				}
			}



		// ============================== UTILS ================================

			function isObject(value) {
				return value !== null && typeof value === 'object';
			}

			function isString(value) {
				return typeof value === 'string';
			}

			function saveToLocalStorage (key, value) {
				if (isLocalStorageAvailable()) {
					localStorage.setItem(key, JSON.stringify(value));
				} else {
					console.error('Caching rates to local storage failed. Local storage not available');
				}
			}

			function getFromLocalStorage (key) {
				if (isLocalStorageAvailable()) {
					return JSON.parse(localStorage.getItem(key));
				} else {
					console.error('Retrieving rates from local storage failed. Local storage not available');
				}
			}

			function isLocalStorageAvailable(){
				var test = 'js-currency-test';
				try {
					localStorage.setItem(test, test);
					localStorage.removeItem(test);
					return true;
				} catch(e) {
					return false;
				}
			}

		})(); 
	});

}(typeof define === 'function' && define.amd ? define : function (deps, factory) {
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = factory(require('jquery'));
	} else {
		window.CurrencyConverter = factory(window.jQuery);
	}
}));