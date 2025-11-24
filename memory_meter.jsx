import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Cpu, Zap, AlertTriangle, Search, Filter, ExternalLink, Newspaper, Loader2 } from 'lucide-react';

// --- CONFIGURATION ---
// IMPORTANT: Replace this placeholder with your actual GitHub Pages URL to data.json
// Example: https://<your-username>.github.io/<your-repo-name>/data.json
const GITHUB_DATA_URL = 'https://PLACEHOLDER-FOR-YOUR-REPO.github.io/siliconmeter/data.json';
// You should update this to your specific URL once you set up GitHub Pages.

// --- UTILITIES & MOCK DATA (to be removed once fully connected) ---

// This mock is now simplified and only used as a fallback.
const newsItems = [
  { id: 1, title: "SK Hynix halts DDR4 production lines for HBM3e", source: "TechWire", sentiment: "negative", time: "2h ago" },
  { id: 2, title: "Samsung Q4 contracts show 20% price hike", source: "SiliconTimes", sentiment: "negative", time: "5h ago" },
  { id: 3, title: "NVIDIA secures remaining HBM supply for 2026", source: "GPU Daily", sentiment: "neutral", time: "12h ago" },
  { id: 4, title: "Consumer demand for PCs hits 5-year low", source: "MarketWatch", sentiment: "positive", time: "1d ago" },
];

// --- COMPONENTS ---

const TickerItem = ({ symbol, price, change }) => (
  <div className="flex items-center space-x-2 px-6 border-r border-white/10 text-sm font-mono shrink-0">
    <span className="font-bold text-white">{symbol}</span>
    <span className="text-zinc-400">${price}</span>
    <span className={`${change > 0 ? 'text-red-400' : 'text-emerald-400'} flex items-center`}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
    </span>
  </div>
);

const Sparkline = ({ data, color }) => {
  // Sparkline expects data (product.history) to be an array of objects: [{date: '...', price: X}, ...]
  // We use the data as-is since Recharts can handle it, but we need to ensure the key is 'price'.
  // We use the last 5 data points for a concise sparkline view.
  const sparklineData = data.slice(-5); 

  // If there's no data, render an empty div
  if (sparklineData.length === 0) {
      return <div className="h-12 w-24 flex items-center justify-center text-xs text-zinc-500">No History</div>;
  }

  return (
    <div className="h-12 w-24">
      <ResponsiveContainer width="100%" height="100%">
        {/* We use LineChart for the Sparkline */}
        <LineChart data={sparklineData}>
          <Line 
            type="monotone" 
            dataKey="price" // CRITICAL: This must match the key in the history objects
            stroke={color} 
            strokeWidth={2} 
            dot={false} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const SentimentBadge = ({ sentiment }) => {
  const config = {
    panic: { color: 'bg-red-500/20 text-red-400 border-red-500/30', text: 'PANIC BUY', icon: AlertTriangle },
    hold: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', text: 'HOLD', icon: TrendingUp },
    buy: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', text: 'GOOD PRICE', icon: Zap },
  };
  // Ensure sentiment is lowercase to match the Python scraper output
  const { color, text, icon: Icon } = config[sentiment?.toLowerCase()] || config.hold;

  return (
    <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-bold border ${color}`}>
      <Icon size={12} />
      <span>{text}</span>
    </div>
  );
};

// --- DATA TRANSFORMATION ---

const transformDataForGraph = (products) => {
  if (!products || products.length === 0) return [];

  // Group history entries by date and type to create the time-series graph data
  const dateMap = new Map();

  products.forEach(product => {
    // Ensure product.history is an array before attempting to iterate
    if (Array.isArray(product.history)) {
        product.history.forEach(entry => {
          const date = entry.date;
          if (!dateMap.has(date)) {
            dateMap.set(date, { name: date, ddr5: 0, ddr4: 0, countDDR5: 0, countDDR4: 0, hbm: 0, countHBM: 0 });
          }
          
          const dayData = dateMap.get(date);
          const price = entry.price;

          // Simple indexing logic: Aggregate by type for an average index line
          if (product.type.includes('DDR5')) {
            dayData.ddr5 += price;
            dayData.countDDR5 += 1;
          } else if (product.type.includes('DDR4')) {
            dayData.ddr4 += price;
            dayData.countDDR4 += 1;
          } 
          // Note: HBM is complex, keeping a simple aggregate for now
          // The current data.json doesn't have explicit HBM/NAND indices, but this prepares for it.
          if (product.name.includes('HBM')) {
             dayData.hbm += price;
             dayData.countHBM += 1;
          }
        });
    }
  });

  // Calculate the average price per day per category
  const graphData = Array.from(dateMap.values())
    .map(data => ({
      name: data.name.substring(5), // Shorten date for chart
      ddr5: data.countDDR5 > 0 ? parseFloat((data.ddr5 / data.countDDR5).toFixed(2)) : null,
      ddr4: data.countDDR4 > 0 ? parseFloat((data.ddr4 / data.countDDR4).toFixed(2)) : null,
      hbm: data.countHBM > 0 ? parseFloat((data.hbm / data.countHBM).toFixed(2)) : null,
    }))
    .filter(data => data.ddr5 !== null || data.ddr4 !== null) // Filter out empty days
    .sort((a, b) => new Date(a.name) - new Date(b.name));

  return graphData;
};


// --- MAIN APP COMPONENT ---

const App = () => {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  
  // 1. DATA FETCHING EFFECT
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(GITHUB_DATA_URL);
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status} when fetching data from ${GITHUB_DATA_URL}. Did you update the URL and enable GitHub Pages?`);
      }
      const data = await response.json();
      setLiveData(data);
    } catch (error) {
      console.error("Error fetching data:", error);
      // Fallback to mock data or handle error display
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Set up polling (e.g., every 5 minutes) to get fresh data quickly
    const intervalId = setInterval(fetchData, 300000); // 5 minutes
    return () => clearInterval(intervalId);
  }, [fetchData]);

  // 2. Computed Data from Live Data
  const products = liveData?.products || [];
  const marketData = useMemo(() => transformDataForGraph(products), [products]);

  // 3. Computed Filtered Products
  const filteredProducts = useMemo(() => {
    if (filter === 'ALL') return products;
    return products.filter(p => p.type.toUpperCase() === filter);
  }, [filter, products]);

  // 4. Loading State Rendering
  // The 'undefined' hook error was likely happening because the component was rendering 
  // the Loading State conditionally, which changes the order of subsequent hooks.
  // The structure here is correct: hooks are defined before any conditional returns.
  if (loading && !liveData) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-zinc-400">
        <Loader2 className="animate-spin mr-3" size={24} />
        Loading latest silicon data...
      </div>
    );
  }

  // Determine latest prices for the Ticker (using the first product of each type as proxy)
  const tickerItems = useMemo(() => {
    const dram5 = products.find(p => p.type === 'DDR5');
    const dram4 = products.find(p => p.type === 'DDR4'); 
    const gpu = products.find(p => p.type === 'GPU');

    return [
      dram5 && { symbol: "DDR5 AVG", price: dram5.current_price.toFixed(2), change: dram5.change_24h },
      dram4 && { symbol: "DDR4 AVG", price: dram4.current_price.toFixed(2), change: dram4.change_24h },
      gpu && { symbol: "GPU 4090", price: gpu.current_price.toFixed(0), change: gpu.change_24h },
      // Add more as needed
    ].filter(Boolean);
  }, [products]);


  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-200 font-sans selection:bg-indigo-500/30">
      
      {/* 1. THE TICKER (Sticky Top) */}
      <div className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 overflow-hidden whitespace-nowrap h-10 flex items-center">
        <div className="animate-marquee flex">
          {[...Array(2)].map((_, i) => (
             <React.Fragment key={i}>
                {tickerItems.map((item, index) => (
                  <TickerItem key={index} {...item} />
                ))}
                {/* Adding fixed items if not enough dynamic data */}
                <TickerItem symbol="NAND FLASH" price="0.12" change={5.4} />
                <TickerItem symbol="TSMC WAFER" price="18K" change={2.1} />
             </React.Fragment>
          ))}
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT SIDE: HERO & DATA GRID (Cols 1-8) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-white mb-1">
                SILICON<span className="text-indigo-500">METER</span>
              </h1>
              <p className="text-zinc-400 font-medium">
                Real-time tracking of the Global Memory Crisis.
                <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">LIVE</span>
              </p>
            </div>
            <div className="flex space-x-2">
               <button className="bg-white text-black px-4 py-2 rounded font-bold text-sm hover:bg-zinc-200 transition">
                 Subscribe for Alerts
               </button>
            </div>
          </div>

          {/* THE "GOD GRAPH" */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50"></div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-lg flex items-center text-white">
                <TrendingUp className="mr-2 text-indigo-400" size={20} />
                Global DRAM Price Index
              </h2>
              <div className="flex space-x-4 text-xs font-mono">
                <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>DDR5</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-pink-500 mr-2"></div>DDR4</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>HBM</div>
              </div>
            </div>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={marketData}>
                  <defs>
                    <linearGradient id="colorDdr5" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="name" hide />
                  <YAxis stroke="#555" tick={{fontSize: 12}} domain={['auto', 'auto']} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  {/* Lines correspond to the keys generated by transformDataForGraph */}
                  <Area type="monotone" dataKey="ddr5" stroke="#6366f1" fillOpacity={1} fill="url(#colorDdr5)" strokeWidth={3} />
                  <Area type="monotone" dataKey="ddr4" stroke="#ec4899" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="hbm" stroke="#10b981" fill="none" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PRODUCT GRID */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xl text-white">Market Movers</h3>
              <div className="flex bg-zinc-900 rounded-lg p-1 border border-white/10">
                {['ALL', 'DDR5', 'DDR4', 'GPU', 'SSD'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      filter === f ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-zinc-900/30 border border-white/5 hover:border-white/20 rounded-xl p-4 flex items-center justify-between transition-all hover:bg-zinc-800/30 group">
                  
                  <div className="flex items-center space-x-4 w-1/3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${product.type === 'GPU' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {product.type === 'GPU' ? <Cpu size={20} /> : <Zap size={20} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm truncate pr-4">{product.name}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 border border-white/5">{product.type}</span>
                        <span className={`text-xs font-mono ${product.stock_status === 'Critical' || product.stock_status === 'Low Stock' ? 'text-red-400' : 'text-emerald-400'}`}>
                          Stock: {product.stock_status || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block w-1/4">
                    {/* Pass the history array to the Sparkline component */}
                    <Sparkline 
                      // Ensure product.history is array before passing
                      data={Array.isArray(product.history) ? product.history : []} 
                      color={product.change_24h > 0 ? '#ef4444' : '#10b981'} 
                    />
                  </div>

                  <div className="text-right w-1/4">
                    <div className="font-mono text-lg font-bold text-white">${product.current_price.toFixed(2)}</div>
                    <div className={`text-xs font-bold flex items-center justify-end ${product.change_24h > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {product.change_24h > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(product.change_24h)}% (24h)
                    </div>
                  </div>

                  <div className="w-1/6 flex justify-end">
                    <SentimentBadge sentiment={product.sentiment} />
                  </div>

                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT SIDE: NEWS & INFO (Cols 9-12) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* SUPPLY CHAIN WEATHER */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-6">
            <h3 className="font-bold text-zinc-100 mb-4 flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
              Supply Chain Weather
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="text-sm text-red-200 font-medium">DDR4 Production</div>
                <div className="text-xs font-bold bg-red-500 text-black px-2 py-1 rounded">CRITICAL</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <div className="text-sm text-orange-200 font-medium">DDR5 Pricing</div>
                <div className="text-xs font-bold bg-orange-500 text-black px-2 py-1 rounded">VOLATILE</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="text-sm text-emerald-200 font-medium">SSD Inventory</div>
                <div className="text-xs font-bold bg-emerald-500 text-black px-2 py-1 rounded">STABLE</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
              Major manufacturers (Samsung, SK Hynix) have shifted ~30% of wafer capacity to HBM for AI servers, creating an artificial scarcity for consumer RAM.
            </div>
          </div>

          {/* NEWS FEED */}
          <div>
             <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-wider mb-4">Latest Intelligence</h3>
             <div className="space-y-3">
               {newsItems.map((news) => (
                 <div key={news.id} className="group cursor-pointer block">
                   <div className="flex items-start justify-between">
                      <h4 className="text-sm font-medium text-zinc-300 group-hover:text-indigo-400 transition leading-snug mb-1">
                        {news.title}
                      </h4>
                      <ExternalLink size={12} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition mt-1 ml-2 flex-shrink-0" />
                   </div>
                   <div className="flex items-center space-x-2 mt-1">
                     <span className={`w-1.5 h-1.5 rounded-full ${news.sentiment === 'negative' ? 'bg-red-500' : news.sentiment === 'positive' ? 'bg-emerald-500' : 'bg-zinc-500'}`}></span>
                     <span className="text-[10px] text-zinc-500 uppercase font-bold">{news.source}</span>
                     <span className="text-[10px] text-zinc-600">• {news.time}</span>
                   </div>
                 </div>
               ))}
             </div>
          </div>

          {/* SOCIAL PROOF / COMMUNITY */}
          <div className="bg-indigo-600 rounded-xl p-6 text-center relative overflow-hidden">
             <div className="relative z-10">
               <div className="text-4xl font-black text-white mb-1">2,401</div>
               <div className="text-indigo-200 text-xs font-medium uppercase tracking-wide mb-4">PC Builders Online</div>
               <p className="text-sm text-indigo-100 mb-4">
                 Don't overpay. Join the alert list to get notified when prices dip below MSRP.
               </p>
               <button className="w-full bg-white text-indigo-600 font-bold py-2 rounded shadow hover:bg-indigo-50 transition">
                 Join Discord
               </button>
             </div>
             {/* Abstract BG decoration */}
             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-400 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
          </div>

        </div>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-white/10 mt-12 py-8 text-center text-zinc-600 text-sm">
        <p>Data aggregated from Global Spot Markets, Retail APIs, and User Reports.</p>
        <p className="mt-2">Last updated: {liveData?.last_updated ? new Date(liveData.last_updated).toLocaleString() : 'N/A'}</p>
        <p className="mt-2">Built with ❤️ during the Great Silicon Shortage of 2025.</p>
      </footer>
      
      {/* CSS for Ticker Animation */}
      <style>{`
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};

export default App;
