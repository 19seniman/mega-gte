const { ethers } = require('ethers');
const prompt = require('prompt-sync')();
const dotenv = require('dotenv');
dotenv.config();

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m",
    magenta: "\x1b[35m", 
    blue: "\x1b[34m",   
    gray: "\x1b[90m",   
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider   🍉    ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;
        
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};

const RPC_URL = 'https://carrot.megaeth.com/rpc';
const CHAIN_ID = 6342;
const GTE_ADDRESS = '0x9629684df53db9E4484697D0A50C442B2BFa80A8';
const ROUTER_ADDRESS = '0xa6b579684e943f7d00d616a48cf99b5147fc57a5';
const WETH_ADDRESS = '0x776401b9BC8aAe31A685731B7147D4445fD9FB19';
const EXPLORER_URL = 'https://megaexplorer.xyz/tx/';
const GTE_TO_ETH_RATE = 0.000033753025406442;
const TX_DELAY_MS = 10000;
const GAS_PRICE = ethers.parseUnits('0.002', 'gwei');

const ROUTER_ABI = [
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
];

const TOKEN_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
];

const privateKeys = Object.keys(process.env)
    .filter(key => key.startsWith('PRIVATE_KEY_'))
    .map(key => process.env[key])
    .filter(pk => pk && pk.length === 66);

if (privateKeys.length === 0) {
    logger.error('No valid private keys found in .env');
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
const gteContract = new ethers.Contract(GTE_ADDRESS, TOKEN_ABI, provider);

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function approveGTE(wallet, amount) {
    const signer = gteContract.connect(wallet);
    try {
        logger.loading(`Approving GTE for wallet ${wallet.address}`);
        const nonce = await provider.getTransactionCount(wallet.address, 'pending');
        const tx = await signer.approve(ROUTER_ADDRESS, ethers.parseUnits(amount.toString(), 18), {
            gasLimit: 100000,
            gasPrice: GAS_PRICE,
            nonce,
        });
        logger.step(`Approval transaction sent: ${EXPLORER_URL}${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt && receipt.hash) {
            logger.success(`Approval completed: ${EXPLORER_URL}${receipt.hash}`);
            return true;
        } else {
            logger.error(`Approval receipt missing hash for wallet ${wallet.address}`);
            return false;
        }
    } catch (error) {
        logger.error(`Approval failed for wallet ${wallet.address}: ${error.message}`);
        return false;
    }
}

async function swapETHForTokens(wallet, amountETH, txIndex) {
    const signer = routerContract.connect(wallet);
    const path = [WETH_ADDRESS, GTE_ADDRESS];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    try {
        const ethBalance = await provider.getBalance(wallet.address);
        if (ethers.parseEther(amountETH.toString()) > ethBalance) {
            logger.error(`Insufficient ETH balance for wallet ${wallet.address}: ${ethers.formatEther(ethBalance)} ETH`);
            return;
        }

        logger.loading(`Initiating swap ETH for GTE ${txIndex} for wallet ${wallet.address}`);
        
        const nonce = await provider.getTransactionCount(wallet.address, 'pending');
        const tx = await signer.swapExactETHForTokens(
            0,
            path,
            wallet.address,
            deadline,
            {
                value: ethers.parseEther(amountETH.toString()),
                gasLimit: 382028,
                gasPrice: GAS_PRICE,
                nonce,
            }
        );

        logger.step(`Transaction sent: ${EXPLORER_URL}${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt && receipt.hash) {
            logger.success(`Swap completed: ${EXPLORER_URL}${receipt.hash}`);
        } else {
            logger.error(`Swap receipt missing hash for wallet ${wallet.address}`);
        }
    } catch (error) {
        logger.error(`Swap failed for wallet ${wallet.address}: ${error.message}`);
    }
}

async function swapTokensForETH(wallet, amountGTE, txIndex) {
    const signer = routerContract.connect(wallet);
    const path = [GTE_ADDRESS, WETH_ADDRESS];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const amountIn = ethers.parseUnits(amountGTE.toString(), 18);
    const amountOutMin = ethers.parseUnits(
        (amountGTE * GTE_TO_ETH_RATE * 0.95).toFixed(18),
        18
    );

    try {
        const gteBalance = await gteContract.balanceOf(wallet.address);
        if (gteBalance < amountIn) {
            logger.error(`Insufficient GTE balance for wallet ${wallet.address}: ${ethers.formatEther(gteBalance)} GTE`);
            return;
        }

        const approved = await approveGTE(wallet, amountGTE);
        if (!approved) return;
        await sleep(TX_DELAY_MS);

        logger.loading(`Initiating swap GTE for ETH ${txIndex} for wallet ${wallet.address}`);
        
        const nonce = await provider.getTransactionCount(wallet.address, 'pending');
        const tx = await signer.swapExactTokensForETH(
            amountIn,
            amountOutMin,
            path,
            wallet.address,
            deadline,
            {
                gasLimit: 382028,
                gasPrice: GAS_PRICE,
                nonce,
            }
        );

        logger.step(`Transaction sent: ${EXPLORER_URL}${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt && receipt.hash) {
            logger.success(`Swap completed: ${EXPLORER_URL}${receipt.hash}`);
        } else {
            logger.error(`Swap receipt missing hash for wallet ${wallet.address}`);
        }
    } catch (error) {
        logger.error(`Swap failed for wallet ${wallet.address}: ${error.message}`);
    }
}

async function addLiquidityETH(wallet, txIndex) {
    const signer = routerContract.connect(wallet);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const gteAmount = (Math.random() * (0.0005 - 0.0001) + 0.0001).toFixed(18);
    const ethAmount = (gteAmount * GTE_TO_ETH_RATE).toFixed(18);

    try {
        const ethBalance = await provider.getBalance(wallet.address);
        const gteBalance = await gteContract.balanceOf(wallet.address);
        const requiredEth = ethers.parseEther(ethAmount);
        const requiredGte = ethers.parseUnits(gteAmount, 18);

        logger.info(`Adding liquidity: ${gteAmount} GTE and ${ethAmount} ETH`);

        if (ethBalance < requiredEth) {
            logger.error(`Insufficient ETH balance for wallet ${wallet.address}: ${ethers.formatEther(ethBalance)} ETH`);
            return;
        }
        if (gteBalance < requiredGte) {
            logger.error(`Insufficient GTE balance for wallet ${wallet.address}: ${ethers.formatEther(gteBalance)} GTE`);
            return;
        }

        const approved = await approveGTE(wallet, gteAmount);
        if (!approved) return;
        await sleep(TX_DELAY_MS);

        logger.loading(`Initiating liquidity addition ${txIndex} for wallet ${wallet.address}`);
        
        const nonce = await provider.getTransactionCount(wallet.address, 'pending');
        const tx = await signer.addLiquidityETH(
            GTE_ADDRESS,
            requiredGte,
            0,
            0,
            wallet.address,
            deadline,
            {   
                value: requiredEth,
                gasLimit: 460547,
                gasPrice: GAS_PRICE,
                nonce,
            }
        );

        logger.step(`Transaction sent: ${EXPLORER_URL}${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt && receipt.hash) {
            logger.success(`Liquidity added: ${EXPLORER_URL}${receipt.hash}`);
        } else {
            logger.error(`Liquidity receipt missing hash for wallet ${wallet.address}`);
        }
    } catch (error) {
        logger.error(`Liquidity addition failed for wallet ${wallet.address}: ${error.message}`);
    }
}

async function displayCountdown(nextRun) {
    while (Date.now() < nextRun) {
        const remainingMs = nextRun - Date.now();
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
        logger.countdown(`Next run in ${hours}h ${minutes}m ${seconds}s`);
        await sleep(1000);
    }
    process.stdout.write('\n'); // Add a newline after the countdown finishes
}

async function main() {
    logger.banner();
    const swapTxCount = parseInt(prompt('Enter number of daily swap transactions per wallet: '));
    const liquidityTxCount = parseInt(prompt('Enter number of daily liquidity transactions per wallet: '));

    if (isNaN(swapTxCount) || swapTxCount < 0 || isNaN(liquidityTxCount) || liquidityTxCount < 0) {
        logger.error('Invalid transaction counts');
        process.exit(1);
    }

    while (true) {
        const startTime = new Date();
        // Pesan log yang diperbarui untuk menekankan operasi berkelanjutan
        logger.info(`Starting continuous daily transactions at ${startTime.toLocaleString('en-US', { timeZone: 'Asia/Makassar' })}`);
        logger.section('Wallet Processing'); // Added section for clarity

        for (const wallet of wallets) {
            logger.step(`Processing wallet: ${wallet.address}`);
            const ethBalance = await provider.getBalance(wallet.address);
            const gteBalance = await gteContract.balanceOf(wallet.address);
            logger.info(`Wallet ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
            logger.info(`Wallet GTE balance: ${ethers.formatEther(gteBalance)} GTE`);

            logger.section('Swap Transactions'); // Added section for clarity
            for (let i = 0; i < swapTxCount; i++) {
                const amount = (Math.random() * (0.00025 - 0.0001) + 0.0001).toFixed(18);
                if (i % 2 === 0) {
                    await swapETHForTokens(wallet, amount, i + 1);
                } else {
                    await swapTokensForETH(wallet, amount, i + 1);
                }
                await sleep(TX_DELAY_MS);
            }

            logger.section('Liquidity Transactions'); // Added section for clarity
            for (let i = 0; i < liquidityTxCount; i++) {
                await addLiquidityETH(wallet, i + 1);
                await sleep(TX_DELAY_MS);
            }
        }

        logger.success('Daily transactions completed');

        const nextRun = startTime.getTime() + 24 * 60 * 60 * 1000;
        logger.info(`Next run scheduled for ${new Date(nextRun).toLocaleString('en-US', { timeZone: 'Asia/Makassar' })}`);
        await displayCountdown(nextRun);
    }
}

main().catch(error => {
    logger.critical(`Bot crashed: ${error.message}`); // Changed to critical for bot crash
    process.exit(1);
});
