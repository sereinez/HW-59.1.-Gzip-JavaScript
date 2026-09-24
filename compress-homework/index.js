import { compressFile, decompressFile } from './homework.js';

async function performCompressionAndDecompression() {
  try {
    const compressedResult = await compressFile('./files/source.txt');
    console.log('Compressed:', compressedResult);

    const decompressedResult = await decompressFile(
      compressedResult,
      './files/source_decompressed.txt'
    );
    console.log('Decompressed:', decompressedResult);
  } catch (error) {
    console.error(`Error [${error.code ?? 'UNKNOWN'}]:`, error.message);
  }
}

performCompressionAndDecompression();
