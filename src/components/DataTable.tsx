import React, { useState } from 'react';
import { downloadCSV, downloadJSON } from '../utils/Exporter';
import { filterData } from '../utils/filterUtils';

interface DataTableProps {
  layers: any[];
  activeLayerId: string;
  onRowClick: (record: any) => void;
  onTabChange: (layerId: string) => void;
  onCloseTab: (layerId: string) => void;
  onCloseAll: () => void;
}

const DataTable: React.FC<DataTableProps> = ({ layers, activeLayerId, onRowClick, onTabChange, onCloseTab, onCloseAll }) => {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  
  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];

  const filteredData = React.useMemo(() => {
    const sourceData = activeLayer?.filteredData || activeLayer?.data;
    if (!sourceData) return [];
    
    return filterData(sourceData, activeLayer.filters);
  }, [activeLayer?.data, activeLayer?.filteredData, activeLayer?.filters, activeLayer?.id]);

  const displayData = filteredData.slice(0, 500); // Increased for full screen
  const total = filteredData.length;

  if (layers.length === 0) return null;

  return (
    <div className="fixed inset-0 z-60 bg-white flex flex-col animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="h-16 px-6 border-b flex items-center justify-between bg-gray-50/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center space-x-6">
              <button 
                  onClick={onCloseAll}
                  className="group flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:border-blue-500 transition-all shadow-sm"
              >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="text-xs font-black uppercase text-gray-600 group-hover:text-blue-600">Back to Map</span>
              </button>
              
              <div className="h-8 w-px bg-gray-200"></div>
              
              <div>
                  <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Data Explorer</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{total.toLocaleString()} total records available</p>
              </div>
          </div>

          <div className="flex items-center space-x-4">
              <div className="relative">
                  <button 
                      onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all border ${isDownloadOpen ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100'}`}
                  >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a1 1 0 001 1h14a1 1 0 001-1v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      <span className="text-xs font-black uppercase tracking-wider">Export Current View</span>
                      <svg className={`w-3 h-3 transition-transform ${isDownloadOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  
                  {isDownloadOpen && (
                      <div className="absolute top-full right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-60 py-2 min-w-48 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                          <button 
                              onClick={() => {
                                  downloadCSV(filteredData, activeLayer?.dataset || 'export');
                                  setIsDownloadOpen(false);
                              }}
                              className="w-full text-left px-5 py-3 text-[10px] font-black uppercase text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between group/btn"
                          >
                              <span>CSV SpreadSheet</span>
                              <svg className="w-4 h-4 text-gray-300 group-hover/btn:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                          </button>
                          <button 
                              onClick={() => {
                                  downloadJSON(filteredData, activeLayer?.dataset || 'export');
                                  setIsDownloadOpen(false);
                              }}
                              className="w-full text-left px-5 py-3 text-[10px] font-black uppercase text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between group/btn"
                          >
                              <span>JSON Raw Data</span>
                              <svg className="w-4 h-4 text-gray-300 group-hover/btn:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                          </button>
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* Tab Management */}
      <div className="px-6 bg-white border-b flex items-center overflow-x-auto no-scrollbar h-12">
          {layers.map(l => (
              <div 
                  key={l.id}
                  className={`group flex items-center h-full px-6 border-r border-gray-100 cursor-pointer transition-all relative min-w-40 max-w-64
                      ${activeLayerId === l.id ? 'bg-blue-50/30' : 'hover:bg-gray-50'}
                  `}
                  onClick={() => onTabChange(l.id)}
              >
                  <div className="flex items-center space-x-3 min-w-0 pr-8">
                      <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{backgroundColor: `rgb(${l.color[0]}, ${l.color[1]}, ${l.color[2]})`}} />
                      <span className={`text-[11px] font-black uppercase tracking-tight truncate ${activeLayerId === l.id ? 'text-blue-600' : 'text-gray-500'}`}>{l.dataset}</span>
                  </div>
                  <button 
                      onClick={(e) => { e.stopPropagation(); onCloseTab(l.id); }}
                      className={`absolute right-3 p-1 rounded-lg transition-all ${activeLayerId === l.id ? 'text-blue-300 hover:text-red-500 hover:bg-red-50' : 'opacity-0 group-hover:opacity-100 text-gray-400'}`}
                  >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  {activeLayerId === l.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
              </div>
          ))}
      </div>
      
      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-white custom-scrollbar">
          {total === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center shadow-inner">
                      <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <span className="text-[14px] text-gray-300 font-black uppercase tracking-[0.2em]">No results match your filters</span>
              </div>
          ) : (
              <table className="w-full text-left border-collapse min-w-full">
                  <thead className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-md">
                      <tr>
                          {Object.keys(displayData[0]).filter(key => !['geom', 'data', 'isLoading', 'id', 'Dataset'].includes(key)).map(key => (
                              <th key={key} className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] border-b border-gray-100 whitespace-nowrap bg-gray-50/50">{key.replace('_', ' ')}</th>
                          ))}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                      {displayData.map((record: any, i: number) => (
                          <tr 
                              key={i}
                              onClick={() => {
                                onCloseAll(); // Return to map
                                onRowClick(record);
                              }}
                              className="hover:bg-blue-50/30 cursor-pointer transition-all group border-transparent border-l-4 hover:border-blue-500"
                          >
                              {Object.entries(record).filter(([key]) => !['geom', 'data', 'isLoading', 'id', 'Dataset'].includes(key)).map(([_, v]: [any, any], j) => (
                                  <td key={j} className="px-8 py-5 text-[14px] text-gray-600 font-medium truncate max-w-sm group-hover:text-blue-900 transition-colors">
                                      {v?.toString() || '-'}
                                  </td>
                              ))}
                          </tr>
                      ))}
                  </tbody>
              </table>
          )}
      </div>

      {/* Footer Info */}
      <div className="h-10 px-8 bg-gray-50 border-t flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <div>Showing top {displayData.length} records of {total.toLocaleString()}</div>
          <div>Click a row to locate on map</div>
      </div>
    </div>
  );
};


export default DataTable;
