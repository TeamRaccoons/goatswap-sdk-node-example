import { AnchorProvider, Wallet, BN } from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  createReadonlyGoatswapProgram,
  createGoatswapProgram,
  initializePairMethodsBuilder,
  Cluster,
  swapTokenForNftMethodsBuilder,
  loadPairMetasForKeyedPairs,
  KeyedPair,
  Pair,
  MintInfoGoatkeeper,
  MintInfoIndexWithProof,
  fetchAllAddressWithPairs,
  collectionFromCollectionVerification,
  fetchAllAddressWithGoatkeepers,
  createGoatkeeperProgram,
} from "@raccoonsdev/goatswap-sdk";
import { getMetadataForMints } from "@raccoonsdev/solana-contrib";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Command } from "commander";
import { showCollectionPairsAsOrderBooks } from "./collection-tools";
import { loadKeypair } from "./utils";

const CLUSTER: Cluster = "mainnet";
const connection = new Connection("https://ssc-dao.genesysgo.net"); // "https://api.mainnet-beta.solana.com");
const provider = new AnchorProvider(connection, {} as unknown as Wallet, {});
const program = createReadonlyGoatswapProgram(provider, CLUSTER);

async function simulateAndDisplayTx(tx: Transaction, feePayer: PublicKey) {
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const result = await connection.simulateTransaction(tx.compileMessage());
  console.log(result.value.err);
  console.log(result.value.logs);
}

// fetchMintInfo(s) will be implemented later on, only required for goatkeeper collections

async function stubFetchMintInfos(
  mints: string[]
): Promise<MintInfoGoatkeeper[]> {
  throw new Error("fetch mint infos not implemented");
}

async function stubFetchMintInfo(
  mint: string
): Promise<MintInfoIndexWithProof> {
  throw new Error("fetch mint infos not implemented");
}

const command = new Command();

command
  .command("pairs-as-obs")
  .option(
    "-c, --collection",
    "Collection",
    "B3LDTPm6qoQmSEgar2FHUHLt6KEHEGu9eSGejoMMv5eb" // Sea Shanties
  )
  .addHelpText("beforeAll", "Show collection pairs as order books")
  .action(async ({ collection }) =>
    showCollectionPairsAsOrderBooks(program, collection)
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
      const program = createGoatswapProgram(provider, CLUSTER);
      const pairKeypair = new Keypair();
      const builder = await initializePairMethodsBuilder({
        program,
        pairKeypair,
        collectionVerification: {
          collection: { collection: new PublicKey(collection) },
        },
        uiPoolType: poolType,
        spotPrice: new BN(spotPrice),
        delta: new BN(delta),
        feeBps: Number(feeBps),
      });

      if (dryRun) {
        await simulateAndDisplayTx(
          await builder.transaction(),
          program.provider.publicKey
        );
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
    const addressWithPairs = await fetchAllAddressWithPairs(program);
    const addressWithGoatkeepers = await fetchAllAddressWithGoatkeepers(
      createGoatkeeperProgram(provider)
    );

    const collectionToKeyedPairs = addressWithPairs.reduce(
      (acc, { publicKey, account }) => {
        const collection = collectionFromCollectionVerification(
          account.collectionVerification,
          addressWithGoatkeepers
        );
        if (collection) {
          const collectionBase58 = collection.toBase58();
          const pairs = acc.get(collectionBase58) ?? [];
          pairs.push({ address: publicKey, pair: account });
          acc.set(collectionBase58, pairs);
        }

        return acc;
      },
      new Map<string, KeyedPair[]>()
    );

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
    const program = createGoatswapProgram(provider, CLUSTER);
    const pairAddress = new PublicKey(pairArg);

    const pair = (await program.account.pair.fetch(
      pairAddress
    )) as unknown as Pair;
    const keyedPair: KeyedPair = {
      address: pairAddress,
      pair,
    };

    const price = new BN(lamports);
    const pairMeta = (
      await loadPairMetasForKeyedPairs(
        connection,
        program.programId,
        [keyedPair],
        stubFetchMintInfos
      )
    )[0];
    // Buy the first one
    const nft = pairMeta.pairNfts[0];
    const builder = await swapTokenForNftMethodsBuilder({
      program,
      keyedPair,
      nft,
      price,
      slippageBps: 100, // slippage 1%
      fetchMintInfo: stubFetchMintInfo,
    });

    if (dryRun) {
      await simulateAndDisplayTx(
        await builder.transaction(),
        program.provider.publicKey
      );
    } else {
      const signature = await builder.rpc();
      console.log(`txId: ${signature}`);
    }
  });

// TODO: More examples...

command.parse();
