import {
  getPairMetasForCollectionVerification,
  GoatswapProgram,
  pairMetasIntoOrderBooks,
  ReadonlyGoatswapProgram,
} from "@raccoonsdev/goatswap-sdk";
import { lamportsToUiAmount } from "@raccoonsdev/solana-contrib";
import { PublicKey } from "@solana/web3.js";

export async function showCollectionPairsAsOrderBooks(
  program: ReadonlyGoatswapProgram | GoatswapProgram,
  collectionArg: string
) {
  const collection = new PublicKey(collectionArg);
  const pairMetas = await getPairMetasForCollectionVerification(
    program,
    { collection: { collection } },
    async (mints) => {
      throw new Error("Not supported");
    }
  );
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
