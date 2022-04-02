'use strict';

// import { JsonRpcResponse } from 'web3-core-helpers'
import { randomBytes } from 'crypto';
import web3Utils from 'web3-utils';
import { abi } from 'thor-devkit';
import { Wallet } from '@vechain/connex-driver';
import { Transaction } from 'thor-devkit';
import { FilterOpts, Eip1193SubResp } from './types';
import { Web3TxObj } from './types';
import { ConnexProvider } from './provider';

export const toEip1193SubResp = function(ret: any, id: string): Eip1193SubResp {
	return {
		jsonrpc: '2.0',
		type: 'eth_subscription',
		data: {
			subscription: id,
			result: ret,
		}
	}
}

/**
 * Convert the input into either block id or block number compatible with connex.thor.block()
 * @param {hex | 'earliest' | 'latest' } input
 * @returns {string | number | null | undefined} Return null not recognized and undefined if input === 'latest'
 */
export function parseBlockNumber(input: string): string | number | null | undefined {
	// Return block id;
	if (web3Utils.isHexStrict(input) && input.length == 66) {
		return input;
	}

	// Convert block number;
	let num: number | null | undefined = null;
	if (web3Utils.isHexStrict(input)) { num = web3Utils.hexToNumber(input); }
	else if (input === 'earliest') { num = 0; }
	else if (input === 'latest') { num = undefined; }
	return num;
}

export function toBytes32(hex: string): string {
	return web3Utils.padLeft(hex, 64);
}

export function hexToNumber(hex: string): number {
	return web3Utils.hexToNumber(hex);
}

export function randAddr(): string {
	return '0x' + randomBytes(20).toString('hex');
}

export function getErrMsg(output: Connex.VM.Output): string {
	const errorSig = '0x08c379a0';
	let errMsg = output?.revertReason || output.vmError || output.data;

	if (!errMsg.startsWith('0x')) {
		// encode error message to allow sendTxCallback to decode later
		errMsg = abi.encodeParameter('string', errMsg);
	}

	if (!errMsg.startsWith(errorSig)) {
		errMsg = errorSig + errMsg.slice(2);
	}

	return errMsg;
}

export function toFilterCriteria(args: FilterOpts): Connex.Thor.Filter.Criteria<"event">[] {
	const setCriteria = (address: string, topics: any) => {
		const c: Connex.Thor.Filter.Criteria<"event"> = {};

		c.address = address;
		if (topics[0]) { c.topic0 = topics[0]; }
		if (topics[1]) { c.topic1 = topics[1]; }
		if (topics[2]) { c.topic2 = topics[2]; }
		if (topics[3]) { c.topic3 = topics[3]; }

		return c;
	}

	return !Array.isArray(args.address) ?
		[setCriteria(args.address, args.topics)] :
		args.address.map((addr, i) => {
			return setCriteria(addr, args.topics[i]);
		});
}

export const wait = (ms: number) => {
	return new Promise(resolve => {
		setTimeout(() => resolve(true), ms);
	});
}

/** params for tx construction */
const txParams = {
	expiration: 18,
	gasPriceCoef: 0
}

export const signTransaction = async (ethTx: Web3TxObj, wallet: Wallet, provider: ConnexProvider): Promise<string> => {
	if (wallet.list.length == 0) {
		return Promise.reject('Empty wallet');
	}

	const clauses = [{
		to: ethTx.to ? ethTx.to.toLowerCase() : null,
		value: ethTx.value ? ethTx.value : '0x0',
		data: ethTx.data ? ethTx.data : '0x',
	}];

	const gas = ethTx.gas || await provider.request({
		method: 'eth_estimateGas',
		params: [ethTx],
		jsonrpc: '2.0'
	});

	const chainId = provider.chainTag;

	const best = await provider.request({
		method: 'eth_getBlockByNumber',
		params: ['latest'],
		jsonrpc: '2.0'
	});

	const txBody: Transaction.Body = {
		chainTag: chainId,
		blockRef: best.hash.slice(0, 18),
		expiration: txParams.expiration,
		clauses,
		gasPriceCoef: txParams.gasPriceCoef,
		gas,
		dependsOn: null,
		nonce: '0x' + randomBytes(8).toString('hex')
	}

	const tx = new Transaction(txBody)
	tx.signature = await wallet.list[0].sign(tx.signingHash());

	return '0x' + tx.encode().toString('hex');
}