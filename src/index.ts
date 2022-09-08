import { AnchorProvider, Wallet } from "@project-serum/anchor";
import {
  createReadonlyProgram,
  getPairMetasForCollection,
  pairMetasIntoOrderBooks,
} from "@raccoonsdev/goatswap-sdk";
import { lamportsToUiAmount } from "@raccoonsdev/solana-contrib";
import { Connection, PublicKey } from "@solana/web3.js";

async function main() {
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const provider = new AnchorProvider(connection, {} as unknown as Wallet, {});
  const program = createReadonlyProgram(provider, "mainnet");

  // Bitmon creatures
  const collection = new PublicKey(
    "GWkXNWEq3DkEK1x9dMDBUedyGzsDfYaM2c1YpRCyXfGh"
  );
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
main();
