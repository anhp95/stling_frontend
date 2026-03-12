import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { getDuckDB, queryDuckDB } from '../utils/duckdb';
import { API_BASE_URL } from '../config';

interface CatalogProps {
  onAddDataset: (dataType: string, dataset: string, filters?: any) => void;
  onUploadData: (data: any, filteredData: any, name: string, coords: {lat: string, lon: string}, type: string, geoData?: any, duckdbTable?: string) => void;
  onClose: () => void;
  uploadedDatasets?: any[];
}

const Catalog: React.FC<CatalogProps> = ({ onAddDataset, onUploadData, onClose, uploadedDatasets = [] }) => {
  const [catalog, setCatalog] = useState<Record<string, Array<{name: string, count: number}>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [glossOptions, setGlossOptions] = useState<string[]>([]);
  const [selectedGlosses, setSelectedGlosses] = useState<string[]>([]);
  const [glossSearch, setGlossSearch] = useState('');
  const [isGlossDropdownOpen, setIsGlossDropdownOpen] = useState(false);
  const [lastSelectedGloss, setLastSelectedGloss] = useState<string | null>(null);
  const [isGlossFilterEnabled, setIsGlossFilterEnabled] = useState(false);

  useEffect(() => {
    if (!isGlossFilterEnabled) {
      setSelectedGlosses([]);
      setGlossSearch('');
      setIsGlossDropdownOpen(false);
    }
  }, [isGlossFilterEnabled]);
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'browse' | 'upload'>('browse');
  
  const [isDragging, setIsDragging] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const LAT_PATTERNS = [
    /latitude/i, /\blat\b/i, /lat[._\s-]/i, /lat$/i, /^lat/i, /^y$/i, /\by\b/i, /coord.*y/i, /point[._\s-]?y/i, /north/i
  ];
  const LON_PATTERNS = [
    /longitude/i, /\blon\b/i, /\blng\b/i, /\blong\b/i, /lo?ng?[._\s-]/i, /lon$/i, /^lon/i, /lng$/i, /^lng/i, /^x$/i, /\bx\b/i, /coord.*x/i, /point[._\s-]?x/i, /east/i
  ];

  const detectCoordinates = (columns: string[]) => {
    const detected: {lat: string | null, lon: string | null} = { lat: null, lon: null };
    for (const col of columns) {
      if (!detected.lon && LON_PATTERNS.some(p => p.test(col))) detected.lon = col;
      if (!detected.lat && LAT_PATTERNS.some(p => p.test(col))) detected.lat = col;
    }
    return detected;
  };

  const processFile = async (file: File) => {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        setError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 50MB.`);
        return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
        const filename = file.name.toLowerCase();
        let result: any = { name: file.name };

        if (filename.endsWith('.csv')) {
            setUploadProgress(20);
            const { db, conn } = await getDuckDB();
            if (!db || !conn) throw new Error('Failed to initialize DuckDB');
            
            // Register file in DuckDB
            await db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
            setUploadProgress(40);
            
            // Ingest CSV
            const uniqueId = Math.random().toString(36).substring(2, 10);
            const tableName = `table_${uniqueId}_${Date.now()}`;
            await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}')`);
            setUploadProgress(60);
            
            // Get data
            const data = await queryDuckDB(`SELECT * FROM ${tableName}`);
            const columns = Object.keys(data[0] || {});
            const detected = detectCoordinates(columns);
            
            // Filter valid coordinates
            let filteredData = [];
            if (detected.lat && detected.lon) {
                filteredData = data.filter(d => {
                    const lat = parseFloat(d[detected.lat!]);
                    const lon = parseFloat(d[detected.lon!]);
                    return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
                });
            }

            result = {
                ...result,
                data,
                filtered_data: filteredData,
                coordinates: detected,
                type: 'csv',
                duckdbTable: tableName
            };
        } else if (filename.endsWith('.geojson') || filename.endsWith('.json')) {
            setUploadProgress(30);
            const content = await file.text();
            const geojson = JSON.parse(content);
            setUploadProgress(60);

            let data: any[] = [];
            let geoData: any = null;
            let detected = { lat: null, lon: null };

            if (geojson.type === 'FeatureCollection') {
                geoData = geojson;
                data = geojson.features.map((f: any) => ({
                    ...f.properties,
                    ...(f.geometry?.type === 'Point' ? {
                        longitude: f.geometry.coordinates[0],
                        latitude: f.geometry.coordinates[1]
                    } : {})
                }));
                if (data.some(d => d.longitude !== undefined)) {
                    detected = { lat: 'latitude', lon: 'longitude' } as any;
                }
            } else if (Array.isArray(geojson)) {
                data = geojson;
                detected = detectCoordinates(Object.keys(data[0] || {})) as any;
            } else if (geojson.type === 'Feature') {
                geoData = geojson;
                data = [{
                    ...geojson.properties,
                    ...(geojson.geometry?.type === 'Point' ? {
                        longitude: geojson.geometry.coordinates[0],
                        latitude: geojson.geometry.coordinates[1]
                    } : {})
                }];
            }

            // Filter valid coordinates
            let filteredData = [];
            if (detected.lat && detected.lon) {
                filteredData = data.filter(d => {
                    const lat = parseFloat(d[detected.lat!]);
                    const lon = parseFloat(d[detected.lon!]);
                    return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
                });
            }

            result = {
                ...result,
                data,
                filtered_data: filteredData,
                coordinates: detected,
                type: geoData ? 'geojson' : 'json',
                geo_data: geoData
            };
        } else {
            throw new Error('Unsupported file format. Please use .csv or .geojson');
        }

        setUploadProgress(100);
        setTimeout(() => {
            setIsUploading(false);
            onUploadData(result.data, result.filtered_data, result.name, result.coordinates, result.type, result.geo_data, result.duckdbTable);
        }, 500);

    } catch (err: any) {
        console.error("Local processing error:", err);
        setError(err.message || 'Failed to process file locally');
        setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
        processFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        processFile(file);
    }
  };

  const combinedTimestamp = useMemo(() => String(Date.now()).slice(-4), [catalog]);

  const getFilteredCatalog = useMemo(() => {
    const result: Array<{type: string, datasets: Array<{name: string, count: number}>}> = [];
    const COMBINED_NAME = "Combined";
    const COMBINED_DISPLAY_NAME = `Combined_${combinedTimestamp}`;
    
    // Add uploaded datasets first
    if (uploadedDatasets.length > 0) {
        const filteredUploaded = uploadedDatasets.filter(ds => 
            !search || ds.name.toLowerCase().includes(search.toLowerCase())
        ).map(ds => ({ name: ds.name, count: ds.rowCount }));
        
        if (filteredUploaded.length > 0) {
            result.push({ type: 'Session_Uploads', datasets: filteredUploaded });
        }
    }

    if (catalog) {
        Object.entries(catalog).forEach(([type, datasets]) => {
            if (selectedType !== 'all' && selectedType !== type) return;
            
            // Handle virtual combined dataset
            const combinedItem = datasets.find(d => d.name === COMBINED_NAME);
            const regularDatasets = datasets.filter(d => d.name !== COMBINED_NAME);

            const filteredRegular = regularDatasets.filter(ds => 
                !search || (ds && ds.name && ds.name.toLowerCase().includes(search.toLowerCase()))
            );
            
            const finalDatasets = [];
            if (combinedItem) {
                finalDatasets.push({
                    ...combinedItem,
                    name: COMBINED_DISPLAY_NAME
                });
            }
            finalDatasets.push(...filteredRegular);

            if (finalDatasets.length > 0) {
                result.push({ type, datasets: finalDatasets });
            }
        });
    }
    return result;
  }, [catalog, search, selectedType, uploadedDatasets, combinedTimestamp]);

  const currentlyVisibleDatasets = useMemo(() => {
    return getFilteredCatalog.flatMap(cat => cat.datasets.map(ds => ds.name));
  }, [getFilteredCatalog]);

  const lastGlossesUrlRef = useRef<string>('');
  
  useEffect(() => {
    if (selectedType !== 'spoken_language' && selectedType !== 'all') return;
    const params = new URLSearchParams();
    if (search) {
        currentlyVisibleDatasets.slice(0, 100).forEach(ds => params.append('datasets', ds));
    }
    const url = `${API_BASE_URL}/glosses?${params.toString()}`;
    if (lastGlossesUrlRef.current === url) return;
    lastGlossesUrlRef.current = url;

    fetch(url)
      .then(res => res.json())
      .then(data => {
          if (data && data.glosses) {
              setGlossOptions(data.glosses);
          }
      })
      .catch(err => console.error("Failed to load glosses", err));
  }, [currentlyVisibleDatasets, selectedType, search]);

  const lastCatalogUrlRef = useRef<string>('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (isGlossFilterEnabled && selectedGlosses.length > 0) {
        selectedGlosses.forEach(g => params.append('glosses', g));
    }
    const url = `${API_BASE_URL}/catalog?${params.toString()}`;
    if (lastCatalogUrlRef.current === url) return;
    lastCatalogUrlRef.current = url;

    setLoading(true);
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedGlosses, isGlossFilterEnabled]);

  const toggleGloss = (gloss: string) => {
    const isAdding = !selectedGlosses.includes(gloss);
    setSelectedGlosses(prev => 
        isAdding ? [...prev, gloss] : prev.filter(g => g !== gloss)
    );
    if (isAdding) {
      setLastSelectedGloss(gloss);
      setTimeout(() => setLastSelectedGloss(null), 1000);
    }
  };

  const handleSelectAllGlosses = () => {
    const matchingGlosses = glossOptions.filter(g => 
        !glossSearch || g.toLowerCase().includes(glossSearch.toLowerCase())
    );
    setSelectedGlosses(prev => {
        const newSet = new Set(prev);
        matchingGlosses.forEach(g => newSet.add(g));
        return Array.from(newSet);
    });
    setGlossSearch('');
    setGlossSearch('');
  };

  const handleSelectAllDatasets = () => {
    // We need the type for each dataset to form the ID.
    // getFilteredCatalog already groups by type.
    
    const newSelection = new Set(selectedDatasets);
    getFilteredCatalog.forEach(({type, datasets}) => {
        datasets.forEach(ds => {
            newSelection.add(`${type}|${ds.name}`);
        });
    });
    setSelectedDatasets(newSelection);
  };

  const toggleDatasetSelection = (type: string, name: string) => {
    const id = `${type}|${name}`;
    setSelectedDatasets(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return next;
    });
  };

  const handleAddSelected = () => {
    selectedDatasets.forEach(id => {
        const [type, name] = id.split('|');
        if (type === 'Session_Uploads') {
            const ds = uploadedDatasets.find(d => d.name === name);
            if (ds) {
                onUploadData(ds.data, ds.filteredData, ds.name, ds.coords, ds.type, ds.geoData, ds.duckdbTable);
            }
        } else {
            onAddDataset(type, name, { glosses: isGlossFilterEnabled ? selectedGlosses : [] });
        }
    });
  };

  const visibleSelectedGlosses = selectedGlosses.slice(0, 5);
  const hiddenCount = selectedGlosses.length > 5 ? selectedGlosses.length - 5 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col border border-white/20 animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">Data Catalog</h2>
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-0.5">Physical Dataset Explorer</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-800 transition-colors bg-gray-200/50 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold"
          >
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b bg-white">
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all relative ${
              activeTab === 'browse' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>Browse Library</span>
            {activeTab === 'browse' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 animate-in fade-in slide-in-from-bottom-1" />}
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all relative ${
              activeTab === 'upload' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>Upload Files</span>
            {activeTab === 'upload' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 animate-in fade-in slide-in-from-bottom-1" />}
          </button>
        </div>

        {/* Browse Tab Content */}
        {activeTab === 'browse' && (
          <>
            {/* Filter Bar */}
            <div className="p-5 bg-white border-b space-y-4">
            <div className="flex justify-end">
                 <button 
                    onClick={handleSelectAllDatasets}
                    className="text-[10px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors uppercase tracking-wider"
                >
                    Select All Visible
                </button>
            </div>
            <div className="flex flex-col lg:flex-row items-stretch gap-4">
                {/* Dataset Filter */}
                <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Dataset Name</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            list="dataset-suggestions"
                            placeholder="Search dataset (e.g. kusunda)..." 
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <datalist id="dataset-suggestions">
                            {catalog && Object.entries(catalog)
                                .filter(([type]) => selectedType === 'all' || selectedType === type)
                                .flatMap(([_, datasets]) => datasets)
                                .filter(ds => ds && ds.name)
                                .map((ds, idx) => (
                                    <option key={`${ds.name}-${idx}-suggest`} value={ds.name} />
                                ))
                            }
                        </datalist>
                    </div>
                </div>

                {/* Concepticon Gloss Filter */}
                <div 
                    ref={dropdownRef}
                    className={`flex-[1.5] space-y-1.5 transition-opacity duration-300 ${selectedType === 'spoken_language' || selectedType === 'all' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                >
                    <div className="flex items-center justify-between ml-1">
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer bg-blue-50/50 hover:bg-blue-50 px-2 py-1 rounded-lg border border-blue-100/50 transition-colors">
                                <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    checked={isGlossFilterEnabled}
                                    onChange={(e) => setIsGlossFilterEnabled(e.target.checked)}
                                />
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 select-none">Include Concepticon gloss</span>
                            </label>
                            
                            {isGlossFilterEnabled && (
                                <>
                                    <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                                        {selectedGlosses.length} selected
                                    </span>
                                    <button 
                                        onClick={handleSelectAllGlosses}
                                        className="text-[10px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 transition-colors"
                                    >
                                        SELECT ALL {glossSearch ? 'MATCHING' : ''}
                                    </button>
                                </>
                            )}
                        </div>
                        {isGlossFilterEnabled && selectedGlosses.length > 0 && (
                            <button 
                                onClick={() => setSelectedGlosses([])}
                                className="text-[10px] font-bold text-red-500 hover:text-red-700 underline"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                    <div className={`relative group/gloss ${!isGlossFilterEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="absolute left-3 top-3 z-10 transition-transform group-hover/gloss:scale-110">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                        </div>
                        
                        {/* Selector Trigger Area */}
                        <div 
                            onClick={() => setIsGlossDropdownOpen(!isGlossDropdownOpen)}
                            className="w-full flex flex-wrap items-center gap-1.5 pl-10 pr-4 py-1.5 border border-blue-100 rounded-xl bg-blue-50/30 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white min-h-11.5 transition-all relative overflow-hidden"
                        >
                            {visibleSelectedGlosses.map(gloss => (
                                <span 
                                    key={gloss} 
                                    className={`px-2 py-0.5 bg-blue-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm transition-all duration-300 ${lastSelectedGloss === gloss ? 'ring-4 ring-blue-300 scale-110' : ''}`}
                                >
                                    {gloss}
                                    <button onClick={(e) => { e.stopPropagation(); toggleGloss(gloss); }} className="hover:text-blue-200 font-bold ml-0.5">&times;</button>
                                </span>
                            ))}
                            {hiddenCount > 0 && (
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-lg text-[10px] font-black shadow-sm">
                                    ... +{hiddenCount} more
                                </span>
                            )}
                            {selectedGlosses.length === 0 && (
                                <span className="text-gray-400 text-sm py-1">View all glosses...</span>
                            )}
                            <div className="absolute right-3 top-3 text-blue-300">
                                <svg className={`w-4 h-4 transition-transform duration-300 ${isGlossDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        
                        {/* Dropdown Menu */}
                        {isGlossDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-60 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col overflow-hidden max-h-[400px]">
                                <div className="p-3 border-b bg-gray-50/50">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            autoFocus
                                            placeholder="Search glosses (e.g. HAND, WATER)..." 
                                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            value={glossSearch}
                                            onChange={(e) => setGlossSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="overflow-auto py-2 custom-scrollbar">
                                    {glossOptions
                                        .filter(g => !glossSearch || g.toLowerCase().includes(glossSearch.toLowerCase()))
                                        .slice(0, 100) // Performance cap for list rendering
                                        .map(g => {
                                            const isSelected = selectedGlosses.includes(g);
                                            return (
                                                <button 
                                                    key={g} 
                                                    className={`w-full text-left px-5 py-2.5 text-xs font-bold flex items-center justify-between group transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleGloss(g);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white group-hover:border-blue-400'}`}>
                                                            {isSelected && (
                                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <span>{g}</span>
                                                    </div>
                                                    {lastSelectedGloss === g && (
                                                        <span className="text-[9px] font-black text-blue-500 uppercase animate-bounce">Added!</span>
                                                    )}
                                                </button>
                                            );
                                        })
                                    }
                                    {glossOptions.filter(g => !glossSearch || g.toLowerCase().includes(glossSearch.toLowerCase())).length === 0 && (
                                        <div className="px-5 py-8 text-center">
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No matching glosses</p>
                                            <p className="text-[10px] text-gray-300 mt-1">Try a different search term</p>
                                        </div>
                                    )}
                                </div>
                                {glossOptions.length > 100 && !glossSearch && (
                                    <div className="p-2 text-center bg-gray-50 border-t">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Showing first 100 of {glossOptions.length} results</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Type Select */}
                <div className="w-full lg:w-48 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Category</label>
                    <select 
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer font-bold appearance-none bg-no-repeat bg-position-[right_0.75rem_center] bg-size-[1em_1em]"
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
                    >
                        <option value="all">📁 All Types</option>
                        <option value="spoken_language">🗣️ Spoken Language</option>
                        <option value="sign_language">🤟 Sign Language</option>
                        <option value="archaeology">🏺 Archaeology</option>
                        <option value="genetics">🧬 Genetics</option>
                    </select>
                </div>
            </div>
        </div>
        
        {/* Large Upload Drop Zone */}
        <div className="flex-1 overflow-auto p-6 space-y-8 custom-scrollbar bg-gray-50/50">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 space-y-5">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-100 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 border-t-4 border-blue-600 rounded-full animate-spin"></div>
              </div>
              <p className="text-[11px] font-black text-gray-400 animate-pulse uppercase tracking-[0.3em]">Optimizing Index...</p>
            </div>
          )}

          {error && (
            <div className="bg-white border-2 border-red-50 rounded-2xl p-10 text-center shadow-xl shadow-red-50 max-w-md mx-auto">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-gray-800 mb-2 uppercase tracking-tight">Backend Connection Failed</h3>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">{error}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="w-full bg-red-600 text-white text-xs py-4 rounded-xl font-black uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Reconnect to Server
              </button>
            </div>
          )}

          {!loading && !error && getFilteredCatalog.length === 0 && (
            <div className="text-center py-32 opacity-40">
                <svg className="w-20 h-20 text-gray-300 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm text-gray-400 font-black uppercase tracking-[0.2em]">Zero Results Found</p>
                <p className="text-[10px] text-gray-300 font-bold mt-2">Try relaxing your search criteria</p>
            </div>
          )}

          {!loading && !error && getFilteredCatalog.map(({type, datasets}) => (
            <div key={type} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center space-x-4">
                <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600 whitespace-nowrap">
                    {type.replace('_', ' ')}
                </span>
                <div className="h-0.5 bg-linear-to-r from-blue-100 to-transparent flex-1 rounded-full"></div>
                <span className="text-[10px] font-bold text-gray-300 tabular-nums">{datasets.length} Datasets</span>
                <button 
                    onClick={() => {
                        const allSelected = datasets.every(ds => selectedDatasets.has(`${type}|${ds.name}`));
                        const newSet = new Set(selectedDatasets);
                        datasets.forEach(ds => {
                            const id = `${type}|${ds.name}`;
                            if (allSelected) newSet.delete(id);
                            else newSet.add(id);
                        });
                        setSelectedDatasets(newSet);
                    }}
                    className="text-[9px] font-black uppercase text-blue-500 hover:text-blue-700 ml-4 hover:underline"
                >
                    {datasets.every(ds => selectedDatasets.has(`${type}|${ds.name}`)) ? 'Deselect Group' : 'Select Group'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {datasets.map((ds) => {
                  const isCombined = ds.name === "Combined";
                  const isSelected = selectedDatasets.has(`${type}|${ds.name}`);
                  
                  return (
                  <div 
                    key={`${type}-${ds.name}`} 
                    className={`group relative p-5 bg-white border rounded-2xl cursor-pointer transition-all duration-300 active:scale-95 ${
                        isCombined 
                        ? 'border-blue-300 bg-blue-50/20 shadow-lg shadow-blue-50' 
                        : isSelected
                        ? 'border-blue-500 ring-2 ring-blue-100 shadow-xl' 
                        : 'border-gray-100 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-100/50'
                    } ${isCombined && isSelected ? 'ring-2 ring-blue-200 border-blue-600' : ''}`}
                    onClick={() => toggleDatasetSelection(type, ds.name)}
                  >
                    <div className="flex flex-col h-full">
                        <div className="flex justify-between items-start mb-3">
                            <span className={`text-sm font-black transition-colors break-all pr-8 ${isSelected ? 'text-blue-700' : 'text-gray-800 group-hover:text-blue-700'} ${isCombined ? 'text-blue-800' : ''}`}>
                                {ds.name}
                            </span>
                        </div>
                        <div className="mt-auto flex items-center space-x-3">
                            <div className="flex -space-x-1">
                                {isCombined ? (
                                    <div className="w-6 h-6 rounded-full border border-blue-200 bg-blue-600 flex items-center justify-center shadow-sm">
                                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                    </div>
                                ) : (
                                    [1, 2, 3].map(i => (
                                        <div key={i} className="w-4 h-4 rounded-full border border-white bg-blue-100 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${isCombined ? 'text-blue-600' : 'text-gray-400'}`}>
                                {(ds.count || 0).toLocaleString()} Langs
                            </span>
                        </div>
                    </div>
                    <div className={`absolute top-4 right-4 p-2 rounded-xl transition-all duration-300 shadow-sm border ${isSelected ? 'bg-blue-600 text-white opacity-100 scale-100 border-blue-600' : 'bg-blue-50 text-blue-600 opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 border-blue-100'}`}>
                        {isSelected ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                            </svg>
                        )}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          ))}
        </div>
        </>
        )}

        {/* Upload Tab Content */}
        {activeTab === 'upload' && (
          <div className="flex-1 overflow-auto bg-gray-50/50 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-gray-100 p-2 overflow-hidden">
                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        p-12 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all relative overflow-hidden group/upload min-h-[300px]
                        ${isDragging ? 'border-blue-500 bg-blue-50 shadow-2xl scale-[1.01]' : 'border-gray-100 bg-white hover:border-blue-400 hover:bg-gray-50/50'}
                        ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                    `}
                    onClick={() => !isUploading && document.getElementById('catalog-file-input')?.click()}
                >
                    <input 
                        id="catalog-file-input"
                        type="file" 
                        className="hidden" 
                        accept=".csv,.geojson" 
                        onChange={handleFileChange} 
                        disabled={isUploading} 
                    />

                    {isUploading ? (
                        <div className="flex flex-col items-center py-4">
                            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6" />
                            <span className="text-sm font-black text-gray-800 uppercase tracking-widest">Processing Data {Math.round(uploadProgress)}%</span>
                            <div className="w-48 h-1.5 bg-gray-100 rounded-full mt-4 overflow-hidden">
                                <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className={`p-8 rounded-3xl mb-6 transition-all duration-500 ${isDragging ? 'bg-blue-600 scale-110 shadow-blue-200' : 'bg-blue-50 group-hover/upload:scale-110 group-hover/upload:bg-blue-100'}`}>
                                <svg className={`w-12 h-12 ${isDragging ? 'text-white' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-gray-800 tracking-tight uppercase mb-2">
                                    {isDragging ? 'Drop Your Dataset' : 'Upload Research Data'}
                                </h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest max-w-[300px] leading-loose">
                                    Supports <span className="text-blue-600">CSV (with Lat/Lon)</span> and <span className="text-blue-600">GeoJSON</span> formats up to 50MB
                                </p>
                            </div>
                            
                            {isDragging && (
                                <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-[2px] pointer-events-none" />
                            )}
                        </>
                    )}
                </div>
            </div>
            
            <div className="mt-8 grid grid-cols-2 gap-4 max-w-2xl w-full">
                <div className="p-4 bg-white/50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-black">1</div>
                        <span className="text-[10px] font-black uppercase text-gray-600">Prepare</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium leading-relaxed">Ensure your CSV has columns titled 'Latitude' and 'Longitude' or 'lat'/'lon'.</p>
                </div>
                <div className="p-4 bg-white/50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-black">2</div>
                        <span className="text-[10px] font-black uppercase text-gray-600">Visualize</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium leading-relaxed">Uploaded data will appear in the Layer Manager for customization.</p>
                </div>
            </div>
          </div>
        )}

        {/* Action Bar (Only for Browse) */}
        {activeTab === 'browse' && selectedDatasets.size > 0 && (
            <div className="border-t p-4 bg-white flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-black text-gray-600 uppercase tracking-widest">
                        {selectedDatasets.size} Datasets Selected
                    </span>
                    <button 
                        onClick={() => setSelectedDatasets(new Set())}
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:underline uppercase"
                    >
                        Clear Selection
                    </button>
                </div>
                <button
                    onClick={handleAddSelected}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all active:scale-95 flex items-center gap-2"
                >
                    <span>Add {selectedDatasets.size} Layers</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default Catalog;
