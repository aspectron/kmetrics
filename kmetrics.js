true && nw.Window.get().showDevTools();
const path = require('path');
const { Applet } = require('@aspectron/flow-app');
const { dpc } = require('@aspectron/flow-async');
const utils = require('@aspectron/flow-utils');
const bs58 = require('bs58');
const nodeFetch = require('node-fetch');

const FETCH = nodeFetch; // window.fetch seems to have timing issues

import {html, render} from 'lit-html';
import {FlowSampler, flow} from '/node_modules/@aspectron/flow-ux/flow-ux.js';
//import {flow} from '/node_modules/@aspectron/flow-ux/src/base-element.js';


class KMetricsSandbox extends Applet {

	constructor() {
		super('kdx');
		this.blockHashes = [ ];
		this.accumulator = 0;
		this.lastAcc = 0;
		this.tps = [ ]
		this.tpsSamples = 15;
		this.samples = {
			tpsAvg : [],
			transactions_fetch_tsδAvg : []
		}

		// this.initCaption();
	}

	initCaption() {
		let caption = document.querySelector('flow-caption-bar');
		this.caption = caption;
		this.caption.close = this.closeWin;
		this.caption.logo = `/resources/images/kaspa-logo-${this.theme}-bg.png`;

		// caption.version = pkg.version;

		caption.tabs = [{
			title : "Metrics".toUpperCase(),
			id : "metrics",
			cls: "metrics"
		},{
			title : "TxGen".toUpperCase(),
			id : "txgen"
		}];

		caption["active"] = "metrics";
	}

	getPorts(modules) {
		let cfg = {
			types : { },
			ids : { }
		}

		Object.entries(modules).forEach(([k,v]) => {
			try {
				let [type,id] = k.split(':');
				//console.log('getPorts processing',k,v);
				let port = null;
				if(/^kaspad/i.test(type)) {				
				} else if(/^kasparovd/i.test(type)) {
					port = parseInt(v.args.listen.split(':').pop());
				} else if(/^mqtt/i.test(type)) {
					port = v.port;
				}
				if(port) {
					if(!cfg.types[type])
						cfg.types[type] = port;
					cfg.ids[id] = port;
				}
			} catch(ex) {
				console.log('error while processing application config',ex);
			}
		})
		//console.log('getPorts produced:',cfg);
		return cfg;
	}

	async main(config) {
//		let kasparovd = Object.entries(config.modules).map(([k,v]) => { return /^kasparovd/i.test(k) ? v : null }).filter(v=>v).shift();

// TODO - CONVERT TO CONFIG EXTRACTION FUNCTION...
		let default_txgen_args = `--private-key=Bp9PjGHzRTM3yzQbsi5iDJLT5ZLUfessFMKMUJkiTow9
--secondary-address=kaspatest:qpa8dnj0uw6jchdjyffx0200t5e0zhmvgul754z879
--num-outputs=1
--num-inputs=1
--payload-size=20
--gas-fraction=0.05
--fee-rate=5
--tx-interval=1000
--testnet`;//.replace(/\s\s+/g,' ');

		// 
		this.ports = this.getPorts(config.modules);

		this.txgenArgs = document.querySelector('#txgen-args');
		this.txgenArgs.set(default_txgen_args);

		this.terminal = document.querySelector('#txgen');
		// console.log("TPS - Got Terminal", this.terminal);
		this.txgen = new TxGen(this,this.terminal);

		this.runBtn = document.querySelector("#run-txgen");
		this.runBtn.addEventListener('click', () => {
			console.log('run-btn clicked! starting txgen!');
			this.txgen.start();
		})

		this.stopBtn = document.querySelector("#stop-txgen");
		this.stopBtn.addEventListener('click', () => {
			console.log('stop-btn clicked! stopping txgen!');
			this.txgen.stop();
		})


		this.el = document.querySelector('#summary');
		console.log("GOT CONFIG:",config);
		// el.innerHTML = `Hello TPS World!<br/><flow-code><textarea>${JSON.stringify(config,null,'  ')}</textarea></flow-code>`;

// TODO - get MQTT port
// Supply both to TXGEN

		// let kasparovd = Object.entries(config.modules).map(([k,v]) => { return /^kasparovd/i.test(k) ? v : null }).filter(v=>v).shift();
		// console.log("GOT KASPAROVD:", kasparovd);
		// let listen = kasparovd?.args?.listen || '';
		//let port = parseInt(listen.split(':').pop());

//		this.url = `http://${listen}`;

		this.url = `http://localhost:${this.ports.types.kasparovd}`;

		this.skip = 0;

		//el.innerHTML = `Hello TPS World![${listen}]<br/><flow-code><textarea>${JSON.stringify(config,null,'  ')}</textarea></flow-code>`;

		//this.fetch_ = createInterval(this.fetch.bind(this));
		this.el.innerHTML = 'Conneting...';
		//this.skip = await this.count();
		//this.el.innerHTML = `skip: ${this.skip}`;

		dpc(() => { this.run(); })
		dpc(() => { this.fetchTransactions(); })
		//return this.run();

		// let tpsavg = document.querySelector('#tps-avg');
		// console.log('tpsavg:',tpsavg);
		// tpsavg.data = this.samples.tpsAvg;

		this.lastTS = Date.now();
		this.interval = setInterval(()=>{
			let ts = Date.now();
			let duration = ts - this.lastTS;
			this.lastTS = ts;
			let delta = this.accumulator - this.lastAcc;
			this.lastAcc = this.accumulator;
			let v = delta / duration * 1000;
			this.tps.push({ts, v});
			while(this.tps.length > this.tpsSamples)
				this.tps.shift();

			flow.samplers.get('txaccumulator').put(this.accumulator || 0);

			this.tpsLast = this.tps.length ? this.tps[this.tps.length-1].v : 0;
			let tdelta = ts - this.tps[0].ts;
			this.tpsAvg = this.tps.length ? this.tps.map(o=>o.v).reduce((a,b) => a+b, 0) / tdelta * 1000 : 0;

			let txfdl = this.samples?.transactions_fetch_tsδAvg;

			const txfetchdelta = txfdl.length ? txfdl[txfdl.length-1] : 0;
			const txfetchdelta_avg = txfdl.length ? txfdl.reduce((a,b) => a+b, 0) /txfdl.length : 0;
			flow.samplers.get('txfetchdelta').put(txfetchdelta || 0);
			flow.samplers.get('txfetchdelta-avg').put(txfetchdelta_avg || 0);
			
			//	console.log('storing', this.tpsAvg);
			if(!isNaN(this.tpsAvg)) {
				flow.samplers.get('blocks').put(this.skip);
				flow.samplers.get('tpsavg').put(this.tpsAvg);
				flow.samplers.get('tpslast').put(this.tpsLast);
				flow.samplers.get('queue').put(this.blockHashes.length);
			}
			// else {
			// 	console.log('ignoring', this.tpsAvg);

			// }
			//FlowSampler.get('tpsavg').put({ts, value:this.tpsAvg});

			// /this.samples.tpsAvg.push(this.tpsAvg);
			// while(this.samples.tpsAvg.length > 300)
			// 	this.samples.tpsAvg.shift();

			const o = {
				"Position" : this.skip,
				"Transactions" : this.accumulator,
				"TPS" : this.tpsLast.toFixed(2),
				"TPS (Avg)":this.tpsAvg.toFixed(2),
				"Block Queue":this.blockHashes.length,
				"Fetch Duration":txfdl&&txfdl.length?txfdl[txfdl.length-1] : '...',
				"Fetch Duration (Avg)":(txfetchdelta_avg||0).toFixed(0),
			}

			this.el.innerHTML = 
			
				Object.entries(o).map(([k,v]) => {
					return `<span class='wrapper'><span class='caption'>${k}:</span><span class='value'>${v}</span></span>`;
				}).join('');


		},1000);

		return Promise.resolve();
	}

	async run() {
//		console.log("RUN RUNNING");

		let count = await (new Poller().fetch(`${this.url}/blocks/count`));
		//console.log("got count:",count)
		this.skip = count;

		let blocks = new Poller();
		let ts = Date.now();
		blocks.poll(()=>{
			return `${this.url}/blocks?skip=${this.skip}`;

		}, (err, blockHashes) => {
			// console.log("I am in run poller return, err, bh:",err,blockHashes);
			if(err) {
				dpc(()=>{
					this.run();
				})
				return false;
			}

			let tsδ = Date.now() - ts;
			this.lastBlockFetch
			
			if(blockHashes.length) {
				this.skip += blockHashes.length;
				this.blockHashes = this.blockHashes.concat(blockHashes.map(bh=>bh.blockHash));
				return 0;
			}
			else {
				//console.log("I am in run poller ... returning 1e4");
				return 3e3;
			}
		})
	}

	async fetchTransactions() {
		while(this.blockHashes.length) {
			//console.log("pending queue:",this.blockHashes.length);
			//console.log("blockHashes",JSON.stringify(this.blockHashes,null,'\t'));
			let hash = this.blockHashes.shift();
			//console.log("TX [REQ]",hash);
			let ts = Date.now();

			try {
				let ts = Date.now();
				let resp = await FETCH(`${this.url}/transactions/block/${hash}`);
				let ts_req_delta = Date.now() - ts;
				let list = (await resp.json()) || [];
				let tsδ = Date.now() - ts;
				// this.last_tsδ = tsδ;
				this.samples.transactions_fetch_tsδAvg.push(tsδ);
				while(this.samples.transactions_fetch_tsδAvg.length > 10)
					this.samples.transactions_fetch_tsδAvg.shift();
				this.accumulator += list.transactions.length;
				//console.log("TX [RESP]",list.transactions.length, 'for', hash,'--->',ts_req_delta,'msec');
			} catch(ex) {
				console.log("TX [ERROR]",'for', hash);
				console.error(ex);
			}
			//console.log("TX URL:",`${this.url}/transactions/block/${hash}`);
			//console.log("LIST:",list);
			// this.tpsLast = this.tps.length ? this.tps[this.tps.length-1] : 0;
			// this.tpsAvg = this.tps.reduce((a,b) => a+b, 0) / this.tps.length;
			// this.el.innerHTML = `skip: ${this.skip}, tx: ${this.acc},
			
			// tps: ${tpsLast.toFixed(2)} tpsAvg: ${tpsAvg.toFixed(2)}
			// queue: ${this.blockHashes.length}`;
		}

		this.txfetch_dpc = dpc(3e3, () => {
			this.fetchTransactions();
		})
	}


	// 	fetch(`${this.url}/blocks/count`).then()
	// 	let count = 0;
	// 	try {
	// 		let resp = 0;
	// 		count = parseInt((await this.fetch(`${this.url}/blocks/count`)).json());
	// 	} catch(ex) {
	// 		count = 0;
	// 	}
	// }

	// async fetch() {

	// 	await fetch(`this.url/blocks`)



	// 	dpc(() => {
	// 		this.fetch();
	// 	})
	// }



	async shutdown() {
		clearTimeout(this.txfetch)
		Poller.shutdown();
	}

	// createInter



	/*

	fetch blocks
	fetch transactions for all blocks
	count
	average
	update graph

	*/



}


class Poller {

	static pollers = { }

	static shutdown() {
		Object.entries(Poller.pollers).forEach(([k,v]) => v.abort());
		Poller.pollers = { }
	}

	constructor(owner) {
		this.uid = Math.round(Math.random()*0xffffffff).toString(16)+Date.now().toString(16);
		Poller.pollers[this.uid] = this;
		this.abort_ = false;
	}

	abort() {
		if(this.dpc_) {
			clearTimeout(this.dpc_);
			delete this.dpc_;
		}
		this.abort_ = true;
	}

	async fetch(url, wait = 1e4) {
		//console.log('fetch ->:',url);
		this.abort_ = false;
		return new Promise((resolve, reject) => {

			const poller = () => {
				delete this.dpc_;
				const url_ = typeof url == 'function' ? url() : url;
				//console.log('fetcher ->:',url_);
				FETCH(url_)
				.then(async (resp) => {
					let v = await resp.json();
					if(!v || !resp.ok)
						throw resp;
					// if(!v)
					// 	throw resp;
					//console.log("+++ poller resolving with v",v);
					resolve(v);
				})
				.catch(err => {
					//console.log("fetch for error",err);
					if(!this.abort_)
						this.dpc_ = dpc(wait,poller);
				});
			}

			poller();
		})
	}

	poll(url, sink) {
		//console.log('poll ->:',url);
		const poller = () => {
			//console.log('poller ->:',url);
			this.fetch(url).then((data) => {
				// console.log("i got data:",data,'my sink is:',sink);
				let wait = sink(null, data);
				//console.log(new Date(),"i got wait:",wait)
				if(typeof wait == 'number' && wait >= 0 && !this.abort_)
					this.dpc_ = dpc(wait,poller);

			}).catch(ex => () => {
				//console.log("i got error:",ex)
				let wait = sink(err);
				//console.log("i got wait:",wait)
				if(typeof wait == 'number' && wait >= 0 && !this.abort_)
					if(!this.abort_) 
						this.dpc_ = dpc(wait,poller);
			})
		}

		poller();
	}

}

// TODO - MQTT ADDRESS
// TX INTERVAL

// STRINGS? PROCESSING - CONFIG/PORT EXTRACTION FUNCTIONS..

/*

Error parsing command-line arguments: Usage:
  txgen [OPTIONS]

Application Options:
  -V, --version            Display version information and exit
      --kasparov-url=      The kasparov url to connect to
      --mqttaddress=       The URL for the MQTT broker
      --mqttuser=          MQTT server user
      --mqttpass=          MQTT server password
      --private-key=       Private key
      --secondary-address= An address that gets paid once per txgen run
      --tx-interval=       Transaction emission interval (in milliseconds)
      --num-outputs=       Target number of transaction outputs (with some
                           randomization)
      --num-inputs=        Target number of transaction inputs (with some
                           randomization)
      --payload-size=      Average size of transaction payload
      --gas-fraction=      The average portion of gas from the gas limit
      --fee-rate=          Average coins per gram fee rate
      --profile=           Enable HTTP profiling on given port -- NOTE port must
                           be between 1024 and 65536
      --testnet            Use the test network
      --regtest            Use the regression test network
      --simnet             Use the simulation test network
      --devnet             Use the development test network

Help Options:
  -h, --help               Show this help message

*/

class TxGen {
	constructor(app, terminal) {
		this.app = app;
		this.terminal = terminal;

		this.bin = path.join(app.binFolder,'txgen'+(/^windows/.test(utils.platform) ? '.exe' : ''));
		this.defaults_DEPRECATED = {
			// address="127.0.0.1:18334"
			//"private-key" : pkbs58, // "32396163626339626538656238333830623863343733333434376538396562653064333233646466353366316261653834383834326664343731646539373039",
			"private-key" : "Bp9PjGHzRTM3yzQbsi5iDJLT5ZLUfessFMKMUJkiTow9",
			// # Private key for secondary address (base-58): 3LXQz6JPpyeJmA4qEDur2pt4e9NKBW4LJMRCpMv2tuQU
			// # Private key for secondary address (hex): 22b7cc43843f0311916c2f5e0b91562ea0fac1c0bd7eef0734803a9915bbbb49
			// - "--secondary-address=kaspatest:qpa8dnj0uw6jchdjyffx0200t5e0zhmvgul754z879"			
			//"secondary-address" : "kaspa:qqg767gkznmsuah5xeer9f72lwqu642nqvlmujtpmk",
			"secondary-address" : "kaspatest:qpa8dnj0uw6jchdjyffx0200t5e0zhmvgul754z879",
			"num-outputs": 1,
			"num-inputs": 1,
			"payload-size": 20,
			"gas-fraction": 0.05,
			"fee-rate": 5,
			"tx-interval" : 1000,
			"testnet" : undefined,
		}

//		let args = { };




	}

	start() {
		this.stop();

		const { ports } = this.app;
		let args = { 
			'kasparov-url' : `http://localhost:${ports.types.kasparovd}`,
			'mqttaddress' : `localhost:${ports.types.mqtt}`,
			'mqttuser' : 'user',
			'mqttpass' : 'pass'
		}

		let str = this.app.txgenArgs.get();
		str = str.replace(/\r|\n/g,' ').replace(/\s\s+/g,' ').trim();
		let defaults = str.split(' ');
		console.log('TXGEN defaults:', defaults);


		args = Object.entries(args).map((o) => {
			const [k,v] = o;
			return {k,v};
		});
		
		args = args.map((p) => {
			return (p.v === undefined ? `--${p.k}` : `--${p.k}=${p.v}`);
		}).concat(defaults);
		console.log('spawn args:',args);
		console.log('spawn args:',args.join(' '));
console.log("starting this.bin:", this.bin);

		this.app.terminal.write(args.join(' ')+'\r\n');
        utils.spawn(this.bin, args, {
            stdout : (data) => { 
				// console.log('txgen stdout', data.toString());
				this.terminal.term.write(data.toString().replace(/\n/g,'\r\n')); 
				return data; 
			},
//            ...opts
        }, (proc) => {
			this.proc = proc;
		}).then((code) => {
			this.log('txgen exit code',code);
		}, (err) => {
			this.log('txgen error', err);
		})
	}

	stop() {
		if(this.proc) {
			this.proc.kill("SIGTERM");
			delete this.proc;
		}
	}

	log(...args) {
		this.terminal.write(args.join(' ').toString().replace(/\n/g,'\r\n'));
	}
}

const kmetrics = new KMetricsSandbox();

