'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {contentFormat,editorialPrompt}=require('../lib/editorial-contract');

test('review scope follows actual media, not a universal six-card assumption',()=>{
 assert.equal(contentFormat([{videoPath:'zh.mp4'},{videoPath:'en.mp4'}]),'radar_video');
 assert.equal(contentFormat([{reports:[{},{},{}]}]),'ak_three_images');
 assert.equal(contentFormat([{imagePaths:['gallery.png']}]),'image_post');
 assert.throws(()=>contentFormat([{videoPath:'a.mp4'},{reports:[{},{},{}]}]),/Separate/);
 const p=editorialPrompt({format:'ak_three_images'});
 assert.match(p,/不要求六卡、配音、字幕/);
 assert.match(p,/真实日期、数据单位、新闻原文/);
 assert.match(p,/suggestions单列非阻断/);
 assert.match(p,/新增阻断必须解释/);
});
