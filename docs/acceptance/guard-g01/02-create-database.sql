-- Run ALONE on maintenance postgres after 00/01, outside any transaction.
CREATE DATABASE wetscan_s01_test_guardg01 WITH OWNER wetscan_guard_migrator TEMPLATE template0 ENCODING 'UTF8';
