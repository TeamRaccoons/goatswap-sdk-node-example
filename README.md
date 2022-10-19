# Goatswap sdk node example

`yarn start init-pair -k ~/.config/solana/id.json -c B3LDTPm6qoQmSEgar2FHUHLt6KEHEGu9eSGejoMMv5eb -p nft -s 0 -d 0 -f 0 --dry-run`

`yarn start swap-token-for-nft -k ~/.config/solana/id.json -p 5W2FG1344FUP6L5WEQPiouFpPYJeegrXQjyQBbbXWuJi -l 1000 --dry-run`

`yarn start pairs-as-obs`

# All indexed collections

https://goatswap.xyz/api/trpc/collectionMetas.all note the field authentic, collections are otherwise permissionlessly indexed

# Notes

Support only for verified collection, goatkeeper (merkle tree) collection will come soon