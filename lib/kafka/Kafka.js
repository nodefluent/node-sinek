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
        this._autoCommitEnabled = null;
        this._isManual = false;

        //producer
        this.isProducer = false;
        this.producer = null;
        this.targetTopics = [];

        this._logger = logger;
        this._connectFired = false;
    }

    getPartitions(topic){
        return new Promise((resolve, reject) => {

            if(!this.client){
                return reject("client is not defined yet, cannot create offset to gather partitions.");
            }

            const offset = new Offset(this.client);
            offset.fetchEarliestOffsets([topic], (err, data) => {

                if(err || !data[topic]){
                    return reject("failed to get offsets of topic: " + topic + "; " + err);
                }

                resolve(Object.keys(data[topic]).map(key => key));
            });
        });
    }

    getEarliestOffsets(topic){
        return new Promise((resolve, reject) => {

            if(!this.client){
                return reject("client is not defined yet, cannot create offset to reset.");
            }

            const offset = new Offset(this.client);
            offset.fetchEarliestOffsets([topic], (err, data) => {

                if(err || !data[topic]){
                    return reject("failed to get offsets of topic: " + topic + "; " + err);
                }

                resolve(data[topic]);
            });
        });
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

    getTopics(){
        return this.targetTopics;
    }

    hardOffsetReset(topic = "t"){
        return Promise.reject("hardOffsetReset has been removed, due to supporting bad kafka consumer behaviour.");
    }

    _getLogger(){

        if(this._logger){
            return this._logger;
        }

        return NOOPL;
    }

    setConsumerOffset(topic = "t", partition = 0, offset = 0){
        this._getLogger().debug("adjusting offset for topic: " + topic + " on partition: " + partition + " to " + offset);
        this.consumer.setOffset(topic, partition, offset);
    }

    commitCurrentOffsets(){
        return new Promise((resolve, reject) => {
            this.consumer.commit((err, data) => {

                if(err){
                    return reject(err);
                }

                resolve(data);
            });
        });
    }

    becomeManualConsumer(topics, groupId, options, dontListenForSIGINT){
        this._isManual = true;
        return this.becomeConsumer(topics, groupId, options, dontListenForSIGINT, false);
    }

    becomeConsumer(topics = ["t"], groupId = "kafka-node-group", _options = {}, dontListenForSIGINT = false, autoCommit = true){

        if(!Array.isArray(topics) || topics.length <= 0){
            throw new Error("becomeConsumer requires a valid topics array, with at least a single topic.");
        }

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
            //zk: undefined,
            //batch: undefined,
            ssl: false,
            groupId: groupId,
            sessionTimeout: 30000,
            protocol: ["roundrobin"],
            fromOffset: "earliest", // latest
            migrateHLC: false,
            migrateRolling: false,
            fetchMaxBytes: 1024 * 100,
            fetchMinBytes: 1,
            fetchMaxWaitMs: 100,
            autoCommit: autoCommit,
            autoCommitIntervalMs: 5000
        };

        //overwrite default options
        _options = _options || {};
        Object.keys(_options).forEach(key => options[key] = _options[key]);

        this._autoCommitEnabled = options.autoCommit;

        this.consumer = new ConsumerGroup(options, topics);
        this.client = this.consumer.client;
        this.isConsumer = true;
        this.pause();

        this.targetTopics = topics;
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
            partitionerType: 3
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
                if(this.consumer){
                    this.consumer.close(true, () => {
                        process.exit();
                    });
                }
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

    close(commit = false){

        if(this.isConsumer){
            return this._closeConsumer(commit);
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

    _closeConsumer(commit) {
        return new Promise((resolve, reject) => {

            this._getLogger().info("trying to close consumer.");

            if(!this.consumer){
                return reject("consumer is null");
            }

            if(!commit){

                this.consumer.close(() => {

                    //this.client.close(() => {
                        this._resetConsumer();
                        resolve();
                   //});
                });

                return;
            }

            this._getLogger().info("trying to commit kafka consumer before close.");

            this.consumer.commit((err, data) => {

                if(err){
                    return reject(err);
                }

                this.consumer.close(() => {

                    //this.client.close(() => {
                        this._resetConsumer();
                        resolve(data);
                    //});
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

                //this.client.close(() =>{

                    this.isProducer = false;
                    this.client = null;
                    this.producer = null;

                    resolve(true);
                //});
            });
        });
    }
}

module.exports = Kafka;