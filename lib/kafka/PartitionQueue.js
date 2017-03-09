"use strict";

const async = require("async");

class PartitionQueue {

    constructor(partition, drainEvent, drainer, asyncLimit = 1, queueDrain = null){

        if(typeof drainEvent !== "function"){
            throw new Error("drainEvent must be a function.");
        }

        if(typeof queueDrain !== "function"){
            throw new Error("queueDrain must be a function.");
        }

        this.partition = partition;
        this._onQueueDrain = queueDrain;
        this._drainEvent = drainEvent;
        this._drainer = drainer;
        this.asyncLimit = asyncLimit;
        this._q = null;

        this._lastProcessed = Date.now();
        this._totalPushed = 0;
        this._totalProcessedMessages = 0;
        this._totalMessageProcessFails = 0;
    }

    _getLogger(){
        return this._drainer._getLogger();
    }

    push(message){
        this._totalPushed++;
        if(this._q){
            this._q.push(message);
        }
    }

    getLastProcessed(){
        return this._lastProcessed;
    }

    getStats(){
        return {
            lastProcessed: this._lastProcessed,
            totalProcessed: this._totalProcessedMessages,
            totalProcessFails: this._totalMessageProcessFails,
            queueSize: this._q ? this._q.length() : null,
            workers: this.asyncLimit,
            totalPushed: this._totalPushed
        };
    }

    build(){

        if(this._q){
            throw new Error("this queue has already been build.");
        }

        this._q = async.queue((msg, done) => {
            if(this._drainEvent){
                setImmediate(() => this._drainEvent(msg, err => {
                    this._lastProcessed = Date.now();
                    this._totalProcessedMessages++;
                    done(err);
                }));
            } else {
                this._getLogger().debug("drainEvent not present, message is dropped.");
            }
        }, this.asyncLimit);

        this._q.drain = () => {
            if(this._onQueueDrain){
                this._onQueueDrain(this.partition);
            }
        };

        this._q.error(err => {
            if (err) {
                this._totalMessageProcessFails++;
                this._getLogger().warn("error was passed back to consumer queue, dropping it silently: " + JSON.stringify(err));
            }
        });

        this._getLogger().info(`partition queue has been build for partition: ${this.partition}.`);
        return this; //chain?
    }

    close(){

        if(this._q){
            this._q.kill();
            this._q = null;
        }

        this._getLogger().info("queue closed.");
    }
}

module.exports = PartitionQueue;