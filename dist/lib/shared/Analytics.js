"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProducerAnalytics = exports.ConsumerAnalytics = exports.defaultAnalyticsInterval = void 0;
const INTERESTING_DISTANCE = 10;
exports.defaultAnalyticsInterval = 1000 * 150;
/**
 * parent analytics class
 */
class Analytics {
    /**
     * creates a new instance
     * @param {object} config
     * @param {object} logger
     */
    constructor(config = null, logger) {
        this.config = null;
        this._lastErrors = 0;
        this._consumedCount = 0;
        this._lastRes = null;
        this._producedCount = 0;
        this.config = config;
        this.logger = logger;
    }
    /**
     * @private
     * returns occured errors in interval
     * @param {object} stats - getStats() client result
     * @returns {number}
     */
    _errorsInInterval(stats) {
        const diff = (stats.totalErrors || 0) - this._lastErrors;
        this._lastErrors = stats.totalErrors || 0;
        return diff;
    }
    /**
     * @static
     * @param {Array} offsets
     */
    static statusArrayToKeyedObject(offsets = []) {
        const obj = {};
        offsets.forEach(offset => {
            if (!obj[offset.topic]) {
                obj[offset.topic] = {};
            }
            obj[offset.topic][offset.partition] = {
                lowDistance: offset.lowDistance,
                highDistance: offset.highDistance,
                detail: offset.detail
            };
        });
        return obj;
    }
}
/**
 * outsourced analytics for nconsumers
 */
class ConsumerAnalytics extends Analytics {
    /**
     * creates a new instance
     * @param {NConsumer|NProducer} client
     * @param {object} config
     * @param {object} logger
     */
    constructor(client, config = null, logger) {
        super(config, logger);
        this._lastRes = null;
        this.client = client; // consumer or producer.
    }
    /**
     * resolves a comparison between lag states
     * @private
     * @returns {Promise.<object>}
     */
    _checkLagChanges() {
        return __awaiter(this, void 0, void 0, function* () {
            const last = this.client.getLastLagStatus();
            yield this.client.getLagStatus(); //await potential refresh
            const newest = this.client.getLagCache();
            if (!last || !newest) {
                return {
                    error: "No lag status fetched yet."
                };
            }
            if (!last) {
                return {
                    error: "Only newest status fetched yet."
                };
            }
            if (!newest) {
                return {
                    error: "Only last status fetched yet."
                };
            }
            const newLags = {};
            const changedLags = {};
            const resolvedLags = {};
            const stallLags = {};
            const lastKeyed = Analytics.statusArrayToKeyedObject(last.status);
            newest.status.forEach(offset => {
                //didnt exist in last check
                if (!lastKeyed[offset.topic] || !lastKeyed[offset.topic][offset.partition]) {
                    //distance is interesting
                    if (offset.highDistance >= INTERESTING_DISTANCE) {
                        if (!newLags[offset.topic]) {
                            newLags[offset.topic] = {};
                        }
                        //store new lag for this partition
                        newLags[offset.topic][offset.partition] = offset.highDistance;
                    }
                    return;
                }
                //did exist in last check
                //distance decreased
                if (offset.highDistance < INTERESTING_DISTANCE) {
                    if (!resolvedLags[offset.topic]) {
                        resolvedLags[offset.topic] = {};
                    }
                    resolvedLags[offset.topic][offset.partition] = offset.highDistance;
                    return;
                }
                //distance equals
                if (offset.highDistance === lastKeyed[offset.topic][offset.partition].highDistance) {
                    if (!stallLags[offset.topic]) {
                        stallLags[offset.topic] = {};
                    }
                    stallLags[offset.topic][offset.partition] = offset.highDistance;
                    return;
                }
                //distance changed (but did not decrease enough)
                if (!changedLags[offset.topic]) {
                    changedLags[offset.topic] = {};
                }
                changedLags[offset.topic][offset.partition] = offset.highDistance;
            });
            return {
                timelyDifference: newest.at - last.at,
                fetchPerformance: last.took - newest.took,
                newLags,
                changedLags,
                resolvedLags,
                stallLags
            };
        });
    }
    /**
     * gets the largest lag in all assigned offsets
     * @private
     * @returns {object}
     */
    _identifyLargestLag() {
        let lag = {
            highDistance: -1
        };
        const newest = this.client.getLagCache();
        if (!newest) {
            return {
                error: "Only last status fetched yet."
            };
        }
        newest.status.forEach(offset => {
            if (offset.highDistance > lag.highDistance) {
                lag = offset;
            }
        });
        return lag;
    }
    /**
     * returns consumed amount of messages in interval
     * @private
     * @param {object} stats - getStats() client result
     * @returns {number}
     */
    _consumed(stats) {
        const diff = (stats.totalIncoming || 0) - this._consumedCount;
        this._consumedCount = stats.totalIncoming || 0;
        return diff;
    }
    /**
     * @async
     * called in interval
     * @returns {object}
     */
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = {
                generatedAt: Date.now(),
                interval: (this.config) ? this.config.analyticsInterval : exports.defaultAnalyticsInterval,
                lagChange: {},
                largestLag: {},
                consumed: 0,
                errors: 0,
            };
            try {
                res.lagChange = yield this._checkLagChanges();
            }
            catch (error) {
                this.logger.error(`Failed to calculate lag changes ${error.message}.`);
                // res.lagChange = null;
            }
            try {
                res.largestLag = this._identifyLargestLag();
            }
            catch (error) {
                this.logger.error(`Failed to calculate largest lag ${error.message}.`);
                // res.largestLag = null;
            }
            const stats = this.client.getStats();
            try {
                res.consumed = this._consumed(stats);
            }
            catch (error) {
                this.logger.error(`Failed to get consumed count ${error.message}.`);
                // res.consumed = null;
            }
            try {
                res.errors = this._errorsInInterval(stats);
            }
            catch (error) {
                this.logger.error(`Failed to get error count ${error.message}.`);
                // res.errors = null;
            }
            this.logger.debug(JSON.stringify(res));
            this._lastRes = res;
            return res;
        });
    }
    /**
     * returns the last result of run()
     * @returns {object}
     */
    getLastResult() {
        return this._lastRes;
    }
}
exports.ConsumerAnalytics = ConsumerAnalytics;
/**
 * outsourced analytics for nproducers
 */
class ProducerAnalytics extends Analytics {
    /**
     * creates a new instance
     * @param {object} config
     * @param {object} logger
     */
    constructor(client, config = null, logger) {
        super(config, logger);
        this._lastRes = null;
        this.client = client; // consumer or producer.
    }
    /**
     * returns produced amount of messages in interval
     * @private
     * @param {object} stats - getStats() client result
     * @returns {number}
     */
    _produced(stats) {
        const diff = (stats.totalPublished || 0) - this._producedCount;
        this._producedCount = stats.totalPublished || 0;
        return diff;
    }
    /**
     * called in interval
     * @returns {object}
     */
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = {
                generatedAt: Date.now(),
                interval: (this.config) ? this.config.analyticsInterval : exports.defaultAnalyticsInterval,
                produced: 0,
                errors: null,
            };
            const stats = this.client.getStats();
            try {
                res.produced = this._produced(stats);
            }
            catch (error) {
                this.logger.error(`Failed to get produced count ${error.message}.`);
                res.produced = null;
            }
            try {
                res.errors = this._errorsInInterval(stats);
            }
            catch (error) {
                this.logger.error(`Failed to get error count ${error.message}.`);
                res.errors = null;
            }
            this.logger.debug(JSON.stringify(res));
            this._lastRes = res;
            return res;
        });
    }
    /**
     * returns the last result of run()
     * @returns {object}
     */
    getLastResult() {
        return this._lastRes;
    }
}
exports.ProducerAnalytics = ProducerAnalytics;
//# sourceMappingURL=Analytics.js.map