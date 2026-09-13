const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/webkit',outputDir:'artifacts/webkit',fullyParallel:true,
 use:{browserName:'webkit',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1100,height:800}}},{name:'iphone',use:{...devices['iPhone 13']}}]});
