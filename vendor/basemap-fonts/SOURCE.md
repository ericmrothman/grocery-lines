# Basemap glyphs (Noto Sans) (vendored)

- Source: https://protomaps.github.io/basemaps-assets/fonts/ (repository https://github.com/protomaps/basemaps-assets), fetched 2026-10-06
- Licence: SIL Open Font License 1.1, see `OFL.txt`.
- Files (sha256):
  - `Noto Sans Italic/0-255.pbf` 43edfca91c285ba1226f09d5e74d68e1473a088c517f02a5212ff6ccb10037dc
  - `Noto Sans Italic/256-511.pbf` a6f9f6574c86a4a28aba630ca1017857ceadd2370ed32a1293c35f819ab9bd60
  - `Noto Sans Italic/8192-8447.pbf` 5dc4e6680116fef01be024e272859d130262613c7e634409a590e5d50ad124ae
  - `Noto Sans Medium/0-255.pbf` ba2f0118dd024e3041b158e5f9eb49bc0a658019f53f458e9f5c0b8efcd79b91
  - `Noto Sans Medium/256-511.pbf` d5e801a1a5b1d409d3298c3a1e1ca76328e2314a751078833a618620e8e66e4d
  - `Noto Sans Medium/8192-8447.pbf` cc38e4956207f0edba1aaf749b61e8f6f1678ef1ad443d32ee285b21d0eb67aa
  - `Noto Sans Regular/0-255.pbf` 62c6d49b15fa836eb6aa45e259c7ca6762f44b011b09e47776efbe4a6db1b397
  - `Noto Sans Regular/256-511.pbf` 2eca7561f9f566bcacfda5dd04fb5880baec1328ec0f5484678289a13994de8a
  - `Noto Sans Regular/8192-8447.pbf` 8ea977a587352fe31b4159ffdbc9a40be79056f2472017c742ea1e4a931864b9
  - `OFL.txt` 7713cfc8e3c36d5ec4aa3d6cffe7500a1b3310f8a86d914b8ea09c2a9dee7c2d

MapLibre glyph ranges for the three font stacks the basemap labels use, Latin ranges only (0-255, 256-511, 8192-8447). A label character outside them is drawn without that glyph. Added in step DEF-016.

## Inter, IBM Plex Mono and Barlow Condensed (added in step DEF-029c)

- Sources: Inter 4.1 static TTFs from https://github.com/rsms/inter/releases/tag/v4.1; IBM Plex Mono and Barlow Condensed TTFs from https://github.com/google/fonts (ofl/ibmplexmono, ofl/barlowcondensed), fetched 2026-10-07
- Licence: SIL Open Font License 1.1, see `OFL-Inter.txt`, `OFL-IBM-Plex-Mono.txt`, `OFL-Barlow-Condensed.txt`.
- Built with fontnik 0.7.7 (`fontnik.range`) into the same three Latin ranges, one folder per font stack the basemap labels ask for (Regular, Medium for bold labels, Italic for water).
- Files (sha256):
  - `Inter Regular/0-255.pbf` 3eb14a0fa8252ab419bd206f3c35fb7e67e5b9f3b5df2223fdc983b83266e901
  - `Inter Regular/256-511.pbf` 976e67558999bd5be705c83436de4d72dc24810a0d6563d7112337f637d58c72
  - `Inter Regular/8192-8447.pbf` b6dbb3b73c41bd729624a13b9c0f34c5a175931a198f817470b74655b37f6323
  - `Inter Medium/0-255.pbf` b30a3872aebccb8155a928013b2f581d92732d149c8bcc37b31fefdf76213e72
  - `Inter Medium/256-511.pbf` d79774cea7c1681a1d8b89641fe6b1644e364618bad8003104bebaa427870bce
  - `Inter Medium/8192-8447.pbf` 0fcb0eac843ba8366ddc4d6efcb814b21e53b132b53f44d5b9f0cb3f83a8e2da
  - `Inter Italic/0-255.pbf` 236ecd2faa6fcf99b760772e1ba4c43abb37edc9323cd435fa81cf41a2b27334
  - `Inter Italic/256-511.pbf` fb51b3f55d2745bf46178075189face3a40a933c7738342f326123c41cc43658
  - `Inter Italic/8192-8447.pbf` 643769705ce352a07b78c9374a662d346643ed2bec037ac09bcc85ff219cd7c9
  - `IBM Plex Mono Regular/0-255.pbf` a7076dea58a19f17bd917d182aa259c49e4cfeb8dfe04a17b204ee52922668d3
  - `IBM Plex Mono Regular/256-511.pbf` f1d69b2dc02360df7509a5134f61dbf20a0a6f4a12d90bed3d40f597fe428e62
  - `IBM Plex Mono Regular/8192-8447.pbf` 3e41303b531341c2029fabc2eda1b8b166888c7ce0b1816b4df238164f3724b7
  - `IBM Plex Mono Medium/0-255.pbf` 8d5cc87ac38050b713c4f9f02b11c0b97c2e2d58258e1e875b3124062670a8ee
  - `IBM Plex Mono Medium/256-511.pbf` 0e47cb75b97fba39593c2ebf722024668634feddb010a59e87d258114e8dfc77
  - `IBM Plex Mono Medium/8192-8447.pbf` 75a9704ec1bb67a08e2af036c49df72b45a06037b399554a2f301b999dc6f28f
  - `IBM Plex Mono Italic/0-255.pbf` 9547a33c057d34b83d242ca7619ef18b5e741877d82a52df37c6ebb4ea2879a1
  - `IBM Plex Mono Italic/256-511.pbf` 8068a70cffb07a0063afd884aa31d6efb87c904c139e0f421671fa1daf64f1a8
  - `IBM Plex Mono Italic/8192-8447.pbf` 681983a3342e9a2c85f9bff0b60b7987bda6ab62bb6e08872870e5a533a97379
  - `Barlow Condensed Regular/0-255.pbf` e17f1e104f9136bf17c508b8a3360f40fcb4d436a80cdd45edd8ecb246a83ada
  - `Barlow Condensed Regular/256-511.pbf` a2049239eea173e7b1b5afe5ec041320d3c0192d4539c9a9093ece1f8630e2b4
  - `Barlow Condensed Regular/8192-8447.pbf` 6f281e042459f50a3535889aae52ee9e7b4cf9fd5737d9c647f29ec7b695e1bb
  - `Barlow Condensed Medium/0-255.pbf` 74c64af143fe1f940372ee0e352796f02c6e6d5da1a39ff0c2bcbcc6e494b685
  - `Barlow Condensed Medium/256-511.pbf` fe43ab5fca729634eb898902e7e0a3b061d70e1d91f90f3aa3d72bcd66fec574
  - `Barlow Condensed Medium/8192-8447.pbf` 4570b991ac3f967c31c4c8234c3f9cc5e35676291b69c1b113664798b2d2017a
  - `Barlow Condensed Italic/0-255.pbf` 44f4d84262acb654e73e075a40eef95a9bb66e79b1c32118bb682c854e120e6c
  - `Barlow Condensed Italic/256-511.pbf` fe6a1ef016055a6205048ec9c936a5b3b0bbb338aa24fa0c957199f714e5d63a
  - `Barlow Condensed Italic/8192-8447.pbf` e1e387ef3f86e0e90e2ca1d95ce5442e335c6d2c8505c4ee8755820475e6ac2c
