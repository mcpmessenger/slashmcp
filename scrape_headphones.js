// Headphone Scraping and Price Comparison Script
// This script will be used to extract data and compile a report

const craigslistListings = [
  { title: "HEADSET/EARBUDS / HEADPHONES", price: "$0", location: "Des Moines", url: "https://desmoines.craigslist.org/ele/d/des-moines-headset-earbuds-headphones/7896479930.html" },
  { title: "3 ear phones headphones buds wired green blue", price: "$10", location: "Urbandale", url: "https://desmoines.craigslist.org/ele/d/urbandale-ear-phones-headphones-buds/7897018917.html" },
  { title: "Jabra Elite 85h Headphones", price: "$150", location: "Des Moines", url: "https://desmoines.craigslist.org/ele/d/des-moines-jabra-elite-85h-headphones/7896380810.html" },
  { title: "Schiit headphone amplifier stack", price: "$350", location: "Urbandale", url: "https://desmoines.craigslist.org/ele/d/urbandale-schiit-headphone-amplifier/7897704549.html" },
  { title: "Schiit stack Asgard 3 - and Modius DAC", price: "$300", location: "West Des Moines", url: "https://desmoines.craigslist.org/ele/d/west-des-moines-schiit-stack-asgard-and/7870360213.html" },
  { title: "Beats Solo HD wired headphones brand new", price: "$80", location: "Cedar Falls", url: "https://waterloo.craigslist.org/ele/d/cedar-falls-beats-solo-hd-wired/7877144328.html" },
  { title: "Sennheiser headphones", price: "$500", location: "Laurens", url: "https://fortdodge.craigslist.org/ele/d/laurens-sennheiser-headphones/7894027151.html" },
  { title: "SHOKZ Bluetooth Headphone", price: "$25", location: "NE Lincoln", url: "https://lincoln.craigslist.org/ele/d/lincoln-shokz-bluetooth-headphone/7894448420.html" },
  { title: "Sony Headphones", price: "$20", location: "Lanesboro", url: "https://rmn.craigslist.org/ele/d/lanesboro-sony-headphones/7896755818.html" },
  { title: "Beats solo pro", price: "$115", location: "Kansas City", url: "https://kansascity.craigslist.org/ele/d/kansas-city-beats-solo-pro/7893562301.html" },
  { title: "BOSE Noise Cancelling Headphones (QuietComfort)", price: "$180", location: "Olathe, KS", url: "https://kansascity.craigslist.org/ele/d/olathe-bose-noise-cancelling-headphones/7897002243.html" },
  { title: "Sony WH-ULT900N ULT Wear Noise-Cancelling Headphones", price: "$110", location: "Sioux Falls", url: "https://siouxfalls.craigslist.org/ele/d/sioux-falls-sony-wh-ult900n-ult-wear/7893357844.html" },
  { title: "Bose QuietComfort 45 Noise Cancelling Headphones", price: "$220", location: "Apple Valley", url: "https://minneapolis.craigslist.org/dak/ele/d/farmington-bose-quietcomfort-45-noise/7898646712.html" },
  { title: "Mark Levinson No.5909 ANC Bluetooth Headphones", price: "$485", location: "Lakeville", url: "https://minneapolis.craigslist.org/dak/ele/d/lakeville-mark-levinson-no5909-anc/7881293677.html" },
  { title: "Sony MDR-7506 Headphones", price: "$100", location: "Savage", url: "https://minneapolis.craigslist.org/dak/ele/d/savage-sony-mdr-7506-headphones/7872257074.html" }
];

module.exports = { craigslistListings };




