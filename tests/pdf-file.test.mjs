import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {decodePdfFile} from '../src/pdf-file.mjs';

const stub=Buffer.from('%PDF-explicit-decoder-test-stub-not-a-rendered-document\nSource-linked wording remains unchanged.');
function fileResult(bytes=stub,revision=12) {
  return {
    structuredContent:{export:{status:'ready',revision,name:`our-ai-use-case-portfolio-r${revision}.pdf`,mimeType:'application/pdf',encoding:'gzip',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}},
    content:[{type:'text',text:'Compressed PDF for this saved revision.'},{type:'resource',resource:{uri:`workbook://exports/our-ai-use-case-portfolio-r${revision}.pdf.gz`,mimeType:'application/gzip',blob:gzipSync(bytes).toString('base64')}}],
  };
}

test('PDF decoder restores the exact bytes and filename without changing the file result',async()=>{
  const result=fileResult(),before=structuredClone(result);
  const file=await decodePdfFile(result,12);
  assert.equal(file.name,'our-ai-use-case-portfolio-r12.pdf');
  assert.deepEqual(Buffer.from(file.blob,'base64'),stub);assert.deepEqual(result,before);
});

test('PDF decoder rejects a different snapshot revision and a mismatching content hash',async()=>{
  await assert.rejects(()=>decodePdfFile(fileResult(),11),/could not be verified/i);
  const changed=fileResult();changed.structuredContent.export.sha256='0'.repeat(64);
  await assert.rejects(()=>decodePdfFile(changed,12),/integrity check failed/i);
});

test('PDF decoder rejects malformed gzip, missing resource and a mismatching byte length',async()=>{
  const malformed=fileResult();malformed.content[1].resource.blob=Buffer.from('This is not a gzip stream.').toString('base64');
  await assert.rejects(()=>decodePdfFile(malformed,12));
  const missing=fileResult();missing.content.pop();
  await assert.rejects(()=>decodePdfFile(missing,12),/could not be verified/i);
  const length=fileResult();length.structuredContent.export.bytes++;
  await assert.rejects(()=>decodePdfFile(length,12),/integrity check failed/i);
});

test('PDF decoder checks the PDF signature even when the gzip, byte length and hash agree',async()=>{
  await assert.rejects(()=>decodePdfFile(fileResult(Buffer.from('<html>This is not a PDF.</html>')),12),/integrity check failed/i);
});

test('PDF decoder bounds both the compressed input and decompressed output',async()=>{
  const declared=fileResult();declared.structuredContent.export.bytes=5000001;
  await assert.rejects(()=>decodePdfFile(declared,12),/could not be verified/i);
  const compressed=fileResult();compressed.content[1].resource.blob='A'.repeat(140004);
  await assert.rejects(()=>decodePdfFile(compressed,12),/could not be verified/i);
  const expanded=fileResult(Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(5000000,65)]));
  expanded.structuredContent.export.bytes=5000000;
  assert(expanded.content[1].resource.blob.length<140000);
  await assert.rejects(()=>decodePdfFile(expanded,12),/exceeded the download limit/i);
});
