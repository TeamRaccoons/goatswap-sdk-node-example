import { AnchorProvider, Wallet, BN } from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  createReadonlyProgram,
  getPairMetasForCollection,
  initializePairMethodsBuilder,
  pairMetasIntoOrderBooks,
  createProgram,
  Cluster,
  swapTokenForNftMethodsBuilder,
  loadCollectionToKeyedPairs,
  loadPairMetasForKeyedPairs,
  KeyedPair,
} from "@raccoonsdev/goatswap-sdk";
import { getMetadataForMints } from "@raccoonsdev/solana-contrib";
import { lamportsToUiAmount } from "@raccoonsdev/solana-contrib";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { loadKeypair } from "./utils";

const CLUSTER: Cluster = "mainnet";
const connection = new Connection("https://ssc-dao.genesysgo.net"); // "https://api.mainnet-beta.solana.com");
const provider = new AnchorProvider(connection, {} as unknown as Wallet, {});
const program = createReadonlyProgram(provider, CLUSTER);

async function showCollectionPairsAsOrderBooks(collectionArg: string) {
  const collection = new PublicKey(collectionArg);
  const pairMetas = await getPairMetasForCollection(program, collection);
  console.log(`pairMetas.length:`, pairMetas.length);

  // Each pool is unfolded into individual orders
  const { asks, bids } = pairMetasIntoOrderBooks(pairMetas);
  console.log("Asks:");
  asks.forEach(({ price }) => {
    console.log(lamportsToUiAmount(price));
  });
  console.log("Bids:");
  bids.forEach(({ price }) => {
    console.log(lamportsToUiAmount(price));
  });
}

const command = new Command();

command
  .command("pairs-as-obs")
  .option(
    "-c, --collection",
    "Collection",
    "GWkXNWEq3DkEK1x9dMDBUedyGzsDfYaM2c1YpRCyXfGh" // Bitmon creatures
  )
  .addHelpText("beforeAll", "Show collection pairs as order books")
  .action(async ({ collection }) =>
    showCollectionPairsAsOrderBooks(collection)
  );

command
  .command("init-pair")
  .requiredOption("-k, --keypair <KEYPAIR>")
  .requiredOption("-c, --collection <COLLECTION>")
  .requiredOption("-p, --poolType <POOL_TYPE>")
  .requiredOption("-s, --spotPrice <SPOT_PRICE>")
  .requiredOption("-d, --delta <DELTA>")
  .requiredOption("-f, --fee-bps <FEE_BPS>")
  .option("-d, --dry-run")
  .addHelpText("beforeAll", "")
  .action(
    async ({
      keypair,
      collection,
      poolType,
      spotPrice,
      delta,
      feeBps,
      dryRun,
    }) => {
      const kp = loadKeypair(keypair);
      const provider = new AnchorProvider(connection, new NodeWallet(kp), {});
      const program = createProgram(provider, CLUSTER);
      const pairKeypair = new Keypair();
      const builder = await initializePairMethodsBuilder({
        program,
        pairKeypair,
        collection: new PublicKey(collection),
        uiPoolType: poolType,
        spotPrice: new BN(spotPrice),
        delta: new BN(delta),
        feeBps: Number(feeBps),
      });

      if (dryRun) {
        const result = await builder.simulate();
        console.log(result);
        console.log(result.raw);
      } else {
        const signature = await builder.rpc();
        console.log(`txId: ${signature}`);
      }
    }
  );

command
  .command("show-collections")
  .addHelpText(
    "beforeAll",
    "Show all collections and how many pairs there are, does not indicate liquidity"
  )
  .action(async () => {
    const collectionToKeyedPairs = await loadCollectionToKeyedPairs(program);
    const mints = [...collectionToKeyedPairs.keys()].map(
      (c) => new PublicKey(c)
    );
    console.log(`Total of collections: ${mints.length}`);
    const metadatas = await getMetadataForMints(connection, mints);

    // /!\ Those are on-chain collections, anybody can name anything as they wish
    // Mapping to "authentic" collection will come
    metadatas.forEach((metadata) => {
      const keyedPairs = collectionToKeyedPairs.get(metadata.mint.toBase58());
      console.log(
        `${metadata.data.name}, ${metadata.mint.toBase58()}, ${
          keyedPairs?.length
        } pairs`
      );
    });
  });

command
  .command("swap-token-for-nft")
  .requiredOption("-k, --keypair <KEYPAIR>")
  .requiredOption("-p, --pair <PAIR>")
  .requiredOption("-l, --lamports <LAMPORTS>")
  .option("-d, --dry-run")
  .addHelpText("beforeAll", "Buy any from a pair")
  .action(async ({ keypair, pair: pairArg, lamports, dryRun }) => {
    const kp = loadKeypair(keypair);
    const provider = new AnchorProvider(connection, new NodeWallet(kp), {});
    const program = createProgram(provider, CLUSTER);
    const pairAddress = new PublicKey(pairArg);
    const pair = await program.account.pair.fetch(pairAddress);
    const keyedPair: KeyedPair = { address: pairAddress, pair };

    const price = new BN(lamports);
    const pairMeta = (
      await loadPairMetasForKeyedPairs(connection, program.programId, [
        keyedPair,
      ])
    )[0];
    // Buy the first one
    const nft = pairMeta.pairNfts[0];
    const builder = await swapTokenForNftMethodsBuilder(
      program,
      keyedPair,
      nft,
      price,
      0 // slippage 0
    );

    if (dryRun) {
      const tx = await builder.transaction();
      tx.feePayer = program.provider.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const result = await connection.simulateTransaction(tx.compileMessage());
      console.log(result.value.err);
      console.log(result.value.logs);
    } else {
      const signature = await builder.rpc();
      console.log(`txId: ${signature}`);
    }
  });

// TODO: More examples...

command.parse();
