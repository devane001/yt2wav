#!/usr/bin/env node

const { main } = require('../src/cli');

main().catch((error) => {
  console.error(`错误: ${error.message}`);
  process.exitCode = 1;
});
