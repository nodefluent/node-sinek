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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProducerHealth = exports.ConsumerHealth = exports.Check = exports.STATES = void 0;
const lodash_merge_1 = __importDefault(require("lodash.merge"));
const defaultConfig = {
    thresholds: {
        consumer: {
            errors: 5,
            lag: 1000,
            stallLag: 10,
            minMessages: 1
        },
        producer: {
            errors: 4,
            minMessages: 1
        }
    }
};
exports.STATES = {
    DIS_ANALYTICS: -4,
    NO_ANALYTICS: -3,
    UNKNOWN: -2,
    UNCONNECTED: -1,
    HEALTHY: 0,
    RISK: 1,
    WARNING: 2,
    CRITICAL: 3
};
const MESSAGES = {
    DIS_ANALYTICS: "Analytics are disabled, cannot measure required parameters. Please enable.",
    NO_ANALYTICS: "Analytics have not yet run, checks will be available after first run.",
    UNKNOWN: "State is unknown.",
    UNCONNECTED: "The client is not connected.",
    HEALTHY: "No problems detected, client is healthy.",
    ERRORS: "There was an error."
};
/**
 * little pojso class around the check object
 */
class Check {
    /**
     * creates a new instance
     * @param {number} status - status code
     * @param {Array|string} message - message/s, pass an empty array to initialise clean
     */
    constructor(status = exports.STATES.HEALTHY, message = MESSAGES.HEALTHY) {
        this.status = status;
        this.messages = Array.isArray(message) ? message : [message];
    }
    /**
     *
     * @param {number} status - new status code
     * @returns {boolean}
     */
    changeStatus(status = exports.STATES.UNKNOWN) {
        if (status > this.status) {
            this.status = status;
            return true;
        }
        return false;
    }
    /**
     * adds a message to the check
     * @param {string} message - string message to attach
     * @returns {number}
     */
    add(message = MESSAGES.UNKNOWN) {
        return this.messages.push(message);
    }
}
exports.Check = Check;
/**
 * health parent class
 */
class Health {
    /**
     * creates a new instance
     * @param {config} config
     */
    constructor(config) {
        this.STATES = exports.STATES;
        this.MESSAGES = MESSAGES;
        this.config = lodash_merge_1.default({}, defaultConfig, config);
    }
    /**
     * returns a new check instance
     * @param {number} status
     * @param {Array|string} message
     */
    createCheck(status, message) {
        return new Check(status, message);
    }
}
/**
 * health check adapted for NConsumers
 * @extends Health
 */
class ConsumerHealth extends Health {
    /**
     * creates a new instance
     * @param {NConsumer} nconsumer
     * @param {config} config optional
     */
    constructor(nconsumer, config) {
        super(config);
        this.client = nconsumer;
    }
    /**
     * runs the health check
     * @async
     * @returns {Promise.<Check>}
     */
    check() {
        const _super = Object.create(null, {
            createCheck: { get: () => super.createCheck }
        });
        return __awaiter(this, void 0, void 0, function* () {
            /* ### preparation ### */
            if (!this.client.consumer) {
                return _super.createCheck.call(this, exports.STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
            }
            if (!this.client._analytics) {
                return _super.createCheck.call(this, exports.STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
            }
            const analytics = this.client._analytics.getLastResult();
            if (!analytics || Object.keys(analytics).length === 0) {
                return _super.createCheck.call(this, exports.STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
            }
            /* ### eof preparation ### */
            const check = new Check(exports.STATES.HEALTHY, []);
            if (analytics.errors !== null && analytics.errors >= this.config.thresholds.consumer.errors) {
                check.changeStatus(exports.STATES.CRITICAL);
                check.add(MESSAGES.ERRORS);
            }
            if (analytics.largestLag !== null && analytics.largestLag.highDistance &&
                analytics.largestLag.highDistance > this.config.thresholds.consumer.lag) {
                check.changeStatus(exports.STATES.WARNING);
                check.add(`Lag exceeds threshold with a lag of ${analytics.largestLag.highDistance}` +
                    ` on ${analytics.largestLag.topic}:${analytics.largestLag.partition}.`);
            }
            if (analytics.lagChange !== null && typeof analytics.lagChange.stallLags === "object" &&
                Object.keys(analytics.lagChange.stallLags).length > this.config.thresholds.consumer.stallLag) {
                check.changeStatus(exports.STATES.RISK);
                check.add(`Amount of stall lags exceeds threshold with ${Object.keys(analytics.lagChange.stallLags).length} unchanged lagging offsets.`);
            }
            if (analytics.consumed !== null && analytics.consumed < this.config.thresholds.consumer.minMessages) {
                check.changeStatus(exports.STATES.RISK);
                check.add(`Amount of consumed messages is low ${analytics.consumed}.`);
            }
            if (check.status === exports.STATES.HEALTHY) {
                check.add(MESSAGES.HEALTHY);
                check.add(`Consumed ${analytics.consumed} message/s in the last interval, with ${analytics.errors} errors.`);
            }
            return check;
        });
    }
}
exports.ConsumerHealth = ConsumerHealth;
/**
 * health check adapted for NProducers
 * @extends Health
 */
class ProducerHealth extends Health {
    /**
     * creates a new instance
     * @param {NProducer} nproducer
     * @param {config} config
     */
    constructor(nproducer, config) {
        super(config);
        this.client = nproducer;
    }
    /**
     * runs the health check
     * @async
     * @returns {Promise.<Check>}
     */
    check() {
        const _super = Object.create(null, {
            createCheck: { get: () => super.createCheck }
        });
        return __awaiter(this, void 0, void 0, function* () {
            /* ### preparation ### */
            if (!this.client.producer) {
                return _super.createCheck.call(this, exports.STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
            }
            if (!this.client._analytics) {
                return _super.createCheck.call(this, exports.STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
            }
            const analytics = this.client._analytics.getLastResult();
            if (!analytics || Object.keys(analytics).length === 0) {
                return _super.createCheck.call(this, exports.STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
            }
            /* ### eof preparation ### */
            const check = new Check(exports.STATES.HEALTHY);
            if (analytics.errors !== null && analytics.errors >= this.config.thresholds.producer.errors) {
                check.changeStatus(exports.STATES.CRITICAL);
                check.add(MESSAGES.ERRORS);
            }
            if (analytics.produced !== null && analytics.produced < this.config.thresholds.producer.minMessages) {
                check.changeStatus(exports.STATES.RISK);
                check.add(`Amount of produced messages is low ${analytics.produced}.`);
            }
            if (check.status === exports.STATES.HEALTHY) {
                check.add(MESSAGES.HEALTHY);
                check.add(`Produced ${analytics.produced} message/s in the last interval, with ${analytics.errors} errors.`);
            }
            return check;
        });
    }
}
exports.ProducerHealth = ProducerHealth;
//# sourceMappingURL=Health.js.map