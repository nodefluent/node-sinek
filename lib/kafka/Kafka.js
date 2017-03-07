"use strict";

const EventEmitter = require("events");
const {ConsumerGroup, Offset, Client, HighLevelProducer} = require("kafka-node");
const Promise = require("bluebird");

const NOOP = () => {};
const NOOPL = {
    debug: NOOP,
    info: NOOP,
    warn: NOOP,
    error: NOOP
};

class Kafka extends EventEmitter {

    constructor(conString, logger = null){

        super();

        this.zkConnectionString = conString;
        this.client = null;

        //consumer
        this.consumer = null;
        this.offset = null;
        this.isConsumer = false;

        //producer
        this.isProducer = false;
        this.producer = null;
        this.targetTopics = [];

        this._logger = logger;
        this._connectFired = false;
    }

    getOffsets(topic){
        return new Promise((resolve, reject) => {

            if(!this.client){
                return reject("client is not defined yet, cannot create offset to reset.");
            }

            const offset = new Offset(this.client);
            offset.fetchLatestOffsets([topic], (err, data) => {

                if(err || !data[topic]){
                    return reject("failed to get offsets of topic: " + topic + "; " + err);
                }

                resolve(data[topic]);
            });
        });
    }

    hardOffsetReset(topic = "t"){
        return this.getOffsets(topic).then(offsets => {

            Object.keys(offsets).forEach(partition => {
                this.setConsumerOffset(topic, partition, 0);
            });

            return true;
        });
    }

    _getLogger(){

        if(this._logger){
            return this._logger;
        }

        return NOOPL;
    }

    setConsumerOffset(topic = "t", partition = 0, offset = 0){
        this._getLogger().info("adjusting offset for topic: " + topic + " on partition: " + partition + " to " + offset);
        this.consumer.setOffset(topic, partition, offset);
    }

    becomeConsumer(topics = ["t"], groupId = "kafka-node-group", _options = {}, dontListenForSIGINT = false){

        if(this.isConsumer){
            throw new Error("this kafka instance has already been initialised as consumer.");
        }

        if(this.isProducer){
            throw new Error("this kafka instance has already been initialised as producer.");
        }

        if(!groupId){
            throw new Error("missing groupId or consumer configuration.");
        }

        const options = {
            host: this.zkConnectionString,
            zk: undefined,
            batch: undefined,
            ssl: false,
            groupId: groupId,
            sessionTimeout: 12500,
            protocol: ["roundrobin"],
            fromOffset: "latest", //earliest
            migrateHLC: false,
            migrateRolling: false,
            fetchMaxBytes: 1024 * 100,
            fetchMinBytes: 1,
            fetchMaxWaitMs: 100,
            autoCommit: true,
            autoCommitIntervalMs: 5000
        };

        //overwrite default options
        _options = _options || {};
        Object.keys(_options).forEach(key => options[key] = _options[key]);

        this.consumer = new ConsumerGroup(options, topics);
        this.client = this.consumer.client;
        this.isConsumer = true;

        this._getLogger().info("starting ConsumerGroup for topic: " + JSON.stringify(topics));

        this._attachConsumerListeners(dontListenForSIGINT);
    }

    becomeProducer(targetTopics = ["t"], clientId = "kafka-node-client", _options = {}){

        if(this.isConsumer){
            throw new Error("this kafka instance has already been initialised as consumer.");
        }

        if(this.isProducer){
            throw new Error("this kafka instance has already been initialised as producer.");
        }

        const options = {
            requireAcks: 1,
            ackTimeoutMs: 100,
            partitionerType: 2
        };

        //overwrite default options
        _options = _options || {};
        Object.keys(_options).forEach(key => options[key] = _options[key]);

        this.client = new Client(this.zkConnectionString, clientId);
        this.producer = new HighLevelProducer(this.client, _options);
        this.isProducer = true;

        this._getLogger().info("starting Producer.");
        this.targetTopics = targetTopics;
        this._attachProducerListeners();
    }

    _attachProducerListeners(){

        this.client.on("connect", () => {
            this._getLogger().info("producer is connected.");
        });

        this.producer.on("ready", () => {

            this._getLogger().info("producer is ready.");

            //prevents key-partition errors
            this.client.refreshMetadata(this.targetTopics, () => {
                this._getLogger().info("producer meta-data refreshed.");
                this.emit("ready");
            });
        });

        this.producer.on("error", error => {
            //dont log these, they emit very often
            this.emit("error", error);
        });
    }

    _attachConsumerListeners(dontListenForSIGINT = false){

        this.client.on("connect", () => {

            //not sure why, but kafka-node seems to emit this twice
            if(!this._connectFired){
                this._connectFired = true;
                this._getLogger().info("consumer is connected / ready.");
                this.emit("connect");
                this.emit("ready");
            }
        });

        //do not listen for "message" here

        this.consumer.on("error", error => {
            //dont log these, they emit very often
            this.emit("error", error);
        });

        this.consumer.on("offsetOutOfRange", error => {
            //dont log these, they emit very often
            this.emit("error", error);
        });

        //prevents re-balance errors
        if(!dontListenForSIGINT){
            process.on("SIGINT", () => {
                this.consumer.close(true, () => {
                    process.exit();
                });
            });
        }
    }

    isPaused(){

        if(this.isConsumer){
            return this.consumer.paused;
        }

        if(this.isProducer){
            return false;
        }

        throw new Error("neither consumer nor producer have been initialised yet.");
    }

    pause(){

        if(this.isConsumer){
            return this.consumer.pause();
        }

        if(this.isProducer){
            return false;
        }

        throw new Error("neither consumer nor producer have been initialised yet.");
    }

    resume(){

        if(this.isConsumer){
            return this.consumer.resume();
        }

        if(this.isProducer){
            return false;
        }

        throw new Error("neither consumer nor producer have been initialised yet.");
    }

    close(){

        if(this.isConsumer){
            return this._closeConsumer();
        }

        if(this.isProducer){
            return this._closeProducer();
        }

        return null;
    }

    _resetConsumer(){
        this.isConsumer = false;
        this.client = null;
        this.consumer = null;
    }

    _closeConsumer(commit = false) {
        return new Promise((resolve, reject) => {

            this._getLogger().info("trying to close consumer.");

            if(!this.consumer){
                return reject("consumer is null");
            }

            if(!commit){

                this.consumer.close(() => {
                    this._resetConsumer();
                    resolve();
                });

                return;
            }

            this._getLogger().info("trying to commit kafka consumer before close.");

            this.consumer.commit((err, data) => {

                if(err){
                    return reject(err);
                }

                this.consumer.close(() => {
                    this._resetConsumer();
                    resolve(data);
                });
            });
        });
    }

    _closeProducer(){
        return new Promise((resolve, reject) => {

            this._getLogger().info("trying to close producer.");

            if(!this.producer){
                return reject("producer is null");
            }

            this.producer.close(() => {

                this.isProducer = false;
                this.client = null;
                this.producer = null;

                resolve(true);
            });
        });
    }
}

module.exports = Kafka;