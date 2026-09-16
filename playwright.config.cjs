const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/webkit',outputDir:'artifacts/chromium',use:{browserName:'chromium',trace:'retain-on-failure'},projects:[{name:'desktop',use:{viewport:{width:1100,height:800}}}]});
