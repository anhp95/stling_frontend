import React, { useState, useEffect, useRef } from 'react';
import { getAllPalettes } from '../utils/ColorMapper';
import { queryDuckDB } from '../utils/duckdb';
import ColorPalettePanel from './ColorPalettePanel';
import NumericFilter from './NumericFilter';

interface LayerConfig {
  id: string;
  name: string;
  type: string;
  dataset: string;
  visible: boolean;
  opacity: number;
  color: [number, number, number];
  filters?: any;
  vizField?: string;
  displayField?: string;
  tooltipFields?: string[];
  palette?: string[];
  data?: any[];
  isLoading?: boolean;
  isSpatial?: boolean;
  pointSize?: number;
  stroked?: boolean;
  geoData?: any;
  lineWidth?: number;
  strokeColor?: [number, number, number];
  duckdbTable?: string;
  sqlQuery?: string;
  // Label settings
  labelEnabled?: boolean;
  labelField?: string;
  labelSize?: number;
  labelColor?: [number, number, number];
}

interface BaseMapStyle {
  id: string;
  name: string;
  style: string;
  description: string;
  thumbnail: React.FC;
}

// Inline SVG minimap thumbnails — rich geographic detail, no external requests
const DarkThumb: React.FC = () => (
  <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <defs>
      <linearGradient id="dkSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0a0e1a"/><stop offset="100%" stopColor="#111827"/></linearGradient>
      <linearGradient id="dkWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d2137"/><stop offset="100%" stopColor="#071525"/></linearGradient>
    </defs>
    <rect width="120" height="80" fill="url(#dkSky)"/>
    {/* landmass */}
    <path d="M0 45 Q15 30 35 28 Q50 26 55 32 Q62 38 70 30 Q80 20 95 24 Q110 28 120 22 L120 80 L0 80Z" fill="#1c2333"/>
    {/* water body left */}
    <path d="M0 60 Q20 52 38 58 Q50 62 55 58 L55 80 L0 80Z" fill="url(#dkWater)" opacity="0.9"/>
    {/* water body right */}
    <path d="M85 45 Q95 42 105 46 Q112 49 120 44 L120 80 L85 80Z" fill="url(#dkWater)" opacity="0.9"/>
    {/* roads */}
    <line x1="55" y1="28" x2="55" y2="80" stroke="#2a3a52" strokeWidth="1.5"/>
    <line x1="0" y1="48" x2="120" y2="48" stroke="#2a3a52" strokeWidth="1"/>
    <line x1="30" y1="28" x2="30" y2="80" stroke="#222d40" strokeWidth="1"/>
    <line x1="80" y1="24" x2="80" y2="80" stroke="#222d40" strokeWidth="1"/>
    <line x1="0" y1="62" x2="55" y2="62" stroke="#222d40" strokeWidth="0.7"/>
    <line x1="80" y1="58" x2="120" y2="58" stroke="#222d40" strokeWidth="0.7"/>
    {/* city glow dots */}
    <circle cx="55" cy="32" r="2" fill="#3b82f6" opacity="0.7"/>
    <circle cx="35" cy="42" r="1.5" fill="#60a5fa" opacity="0.5"/>
    <circle cx="95" cy="34" r="1.5" fill="#60a5fa" opacity="0.5"/>
    {/* label placeholders */}
    <rect x="46" y="22" width="18" height="4" fill="#3b5268" rx="1" opacity="0.6"/>
    <rect x="28" y="36" width="14" height="3" fill="#2d4155" rx="1" opacity="0.5"/>
    <rect x="87" y="29" width="16" height="3" fill="#2d4155" rx="1" opacity="0.5"/>
  </svg>
);

const PositronThumb: React.FC = () => (
  <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <defs>
      <linearGradient id="ptBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f7f6f1"/><stop offset="100%" stopColor="#f0efe9"/></linearGradient>
    </defs>
    <rect width="120" height="80" fill="url(#ptBg)"/>
    {/* land */}
    <path d="M0 42 Q18 28 38 26 Q52 24 58 30 Q65 36 72 28 Q82 18 98 22 Q111 26 120 20 L120 80 L0 80Z" fill="#eae8e0"/>
    {/* water left */}
    <path d="M0 58 Q22 50 40 56 Q52 60 58 56 L58 80 L0 80Z" fill="#c8dff0" opacity="0.8"/>
    {/* water right */}
    <path d="M88 44 Q100 40 110 44 Q116 47 120 42 L120 80 L88 80Z" fill="#c8dff0" opacity="0.8"/>
    {/* roads */}
    <line x1="58" y1="28" x2="58" y2="80" stroke="#c5c2ba" strokeWidth="1.5"/>
    <line x1="0" y1="46" x2="120" y2="46" stroke="#c5c2ba" strokeWidth="1"/>
    <line x1="30" y1="26" x2="30" y2="80" stroke="#d0cdc6" strokeWidth="0.8"/>
    <line x1="82" y1="22" x2="82" y2="80" stroke="#d0cdc6" strokeWidth="0.8"/>
    <line x1="0" y1="60" x2="58" y2="60" stroke="#d5d2ca" strokeWidth="0.6"/>
    <line x1="82" y1="56" x2="120" y2="56" stroke="#d5d2ca" strokeWidth="0.6"/>
    {/* city dots */}
    <circle cx="58" cy="30" r="2" fill="#888" opacity="0.5"/>
    <circle cx="36" cy="40" r="1.5" fill="#aaa" opacity="0.4"/>
    <circle cx="98" cy="32" r="1.5" fill="#aaa" opacity="0.4"/>
    {/* label placeholders */}
    <rect x="50" y="20" width="16" height="3.5" fill="#ccc" rx="1" opacity="0.7"/>
    <rect x="28" y="34" width="12" height="3" fill="#ccc" rx="1" opacity="0.5"/>
    <rect x="90" y="27" width="14" height="3" fill="#ccc" rx="1" opacity="0.5"/>
  </svg>
);

const BrightThumb: React.FC = () => (
  <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <rect width="120" height="80" fill="#f5f3ed"/>
    {/* land */}
    <path d="M0 44 Q16 30 36 28 Q50 26 56 32 Q63 38 72 30 Q83 20 97 24 Q111 27 120 22 L120 80 L0 80Z" fill="#ede9e1"/>
    {/* park */}
    <path d="M60 28 Q72 24 80 28 Q84 32 80 38 Q72 42 60 38 Q56 34 60 28Z" fill="#b8daa0"/>
    {/* water left */}
    <path d="M0 60 Q22 52 40 58 Q53 62 56 58 L56 80 L0 80Z" fill="#9dc8e0"/>
    {/* water right */}
    <path d="M87 44 Q100 40 110 44 Q116 47 120 42 L120 80 L87 80Z" fill="#9dc8e0"/>
    {/* major roads orange */}
    <line x1="56" y1="28" x2="56" y2="80" stroke="#e8962a" strokeWidth="2"/>
    <line x1="0" y1="46" x2="120" y2="46" stroke="#e8962a" strokeWidth="2"/>
    {/* secondary roads */}
    <line x1="30" y1="28" x2="30" y2="80" stroke="#ddd" strokeWidth="1"/>
    <line x1="82" y1="22" x2="82" y2="80" stroke="#ddd" strokeWidth="1"/>
    <line x1="0" y1="62" x2="56" y2="62" stroke="#ddd" strokeWidth="0.8"/>
    {/* label placeholders */}
    <rect x="48" y="20" width="16" height="4" fill="#b0a898" rx="1" opacity="0.7"/>
    <rect x="28" y="34" width="12" height="3" fill="#b0a898" rx="1" opacity="0.5"/>
  </svg>
);

const LibertyThumb: React.FC = () => (
  <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <defs>
      <linearGradient id="libBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a2744"/><stop offset="100%" stopColor="#151f38"/></linearGradient>
      <linearGradient id="libWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a3a60"/><stop offset="100%" stopColor="#0f2540"/></linearGradient>
    </defs>
    <rect width="120" height="80" fill="url(#libBg)"/>
    {/* land */}
    <path d="M0 46 Q18 32 38 30 Q52 28 58 34 Q65 40 73 32 Q84 22 98 26 Q112 30 120 24 L120 80 L0 80Z" fill="#223058"/>
    {/* water */}
    <path d="M0 62 Q24 54 42 60 Q55 64 58 60 L58 80 L0 80Z" fill="url(#libWater)"/>
    <path d="M88 46 Q102 42 112 46 Q117 49 120 44 L120 80 L88 80Z" fill="url(#libWater)"/>
    {/* roads */}
    <line x1="58" y1="30" x2="58" y2="80" stroke="#3a5580" strokeWidth="1.5"/>
    <line x1="0" y1="50" x2="120" y2="50" stroke="#3a5580" strokeWidth="1"/>
    <line x1="32" y1="30" x2="32" y2="80" stroke="#2d4468" strokeWidth="1"/>
    <line x1="84" y1="26" x2="84" y2="80" stroke="#2d4468" strokeWidth="1"/>
    {/* city glow */}
    <circle cx="58" cy="34" r="2.5" fill="#5b8fd4" opacity="0.6"/>
    <circle cx="38" cy="44" r="1.5" fill="#4a78b8" opacity="0.4"/>
    <circle cx="98" cy="36" r="1.5" fill="#4a78b8" opacity="0.4"/>
    {/* label placeholders */}
    <rect x="50" y="24" width="16" height="4" fill="#3d5a80" rx="1" opacity="0.7"/>
    <rect x="30" y="37" width="13" height="3" fill="#2d4468" rx="1" opacity="0.6"/>
    <rect x="88" y="31" width="15" height="3" fill="#2d4468" rx="1" opacity="0.6"/>
  </svg>
);

const OsmThumb: React.FC = () => (
  <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <rect width="120" height="80" fill="#f2efe9"/>
    {/* land */}
    <path d="M0 44 Q16 30 36 28 Q50 26 56 32 Q63 38 72 30 Q83 20 97 24 Q111 27 120 22 L120 80 L0 80Z" fill="#ede9df"/>
    {/* park green */}
    <path d="M60 28 Q74 22 82 28 Q86 34 80 40 Q70 44 62 40 Q56 36 60 28Z" fill="#b5d29b"/>
    {/* water */}
    <path d="M0 60 Q22 52 40 58 Q54 62 56 58 L56 80 L0 80Z" fill="#aad3df"/>
    <path d="M87 44 Q100 40 110 44 Q116 47 120 42 L120 80 L87 80Z" fill="#aad3df"/>
    {/* OSM orange roads (cased) */}
    <line x1="56" y1="28" x2="56" y2="80" stroke="#fff" strokeWidth="3"/>
    <line x1="56" y1="28" x2="56" y2="80" stroke="#f9b96f" strokeWidth="1.5"/>
    <line x1="0" y1="46" x2="120" y2="46" stroke="#fff" strokeWidth="3"/>
    <line x1="0" y1="46" x2="120" y2="46" stroke="#f9b96f" strokeWidth="1.5"/>
    {/* secondary */}
    <line x1="30" y1="28" x2="30" y2="80" stroke="#fff" strokeWidth="2"/>
    <line x1="30" y1="28" x2="30" y2="80" stroke="#ddd" strokeWidth="1"/>
    <line x1="82" y1="22" x2="82" y2="80" stroke="#fff" strokeWidth="2"/>
    <line x1="82" y1="22" x2="82" y2="80" stroke="#ddd" strokeWidth="1"/>
    <line x1="0" y1="62" x2="56" y2="62" stroke="#e8e2d8" strokeWidth="1"/>
    {/* label placeholders */}
    <rect x="48" y="20" width="16" height="4" fill="#a09880" rx="1" opacity="0.6"/>
    <rect x="28" y="34" width="12" height="3" fill="#a09880" rx="1" opacity="0.5"/>
    <rect x="88" y="29" width="14" height="3" fill="#a09880" rx="1" opacity="0.5"/>
  </svg>
);

const TopoThumb: React.FC = () => (
  <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <defs>
      <linearGradient id="topoBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ede0c4"/><stop offset="100%" stopColor="#e4d4b0"/></linearGradient>
    </defs>
    <rect width="120" height="80" fill="url(#topoBg)"/>
    {/* terrain shading */}
    <path d="M60 5 Q75 15 85 12 Q95 8 105 18 Q115 28 120 18 L120 50 Q110 48 98 44 Q82 38 75 30 Q68 22 60 28 Q52 34 44 28 Q36 22 24 32 Q14 40 0 36 L0 5Z" fill="#d4c4a0" opacity="0.6"/>
    {/* forest */}
    <path d="M65 12 Q78 8 88 12 Q92 18 86 24 Q76 28 66 24 Q60 18 65 12Z" fill="#7aab68" opacity="0.55"/>
    {/* contour lines */}
    <path d="M0 50 Q20 42 40 46 Q60 50 80 42 Q100 34 120 38" fill="none" stroke="#b09060" strokeWidth="0.8" opacity="0.7"/>
    <path d="M0 40 Q22 32 44 36 Q64 40 84 30 Q102 22 120 28" fill="none" stroke="#b09060" strokeWidth="1" opacity="0.65"/>
    <path d="M0 28 Q25 18 50 24 Q70 30 90 18 Q105 10 120 18" fill="none" stroke="#b09060" strokeWidth="0.7" opacity="0.6"/>
    <path d="M10 18 Q32 8 55 14 Q76 20 95 8" fill="none" stroke="#b09060" strokeWidth="0.6" opacity="0.5"/>
    {/* river */}
    <path d="M55 30 Q58 45 54 60 Q51 70 48 80" fill="none" stroke="#8ab8cc" strokeWidth="1.5"/>
    {/* water body */}
    <path d="M0 65 Q30 58 60 64 Q85 70 120 62 L120 80 L0 80Z" fill="#9fc8d8"/>
    {/* roads */}
    <line x1="55" y1="28" x2="55" y2="64" stroke="#b89850" strokeWidth="1.5"/>
    <line x1="0" y1="52" x2="120" y2="52" stroke="#c0a058" strokeWidth="1"/>
    {/* peak */}
    <path d="M85 8 L78 20 L92 20Z" fill="#c8b080" stroke="#b09060" strokeWidth="0.5"/>
  </svg>
);

const BASEMAP_STYLES: BaseMapStyle[] = [
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark modern',
    style: 'https://tiles.openfreemap.org/styles/dark',
    thumbnail: DarkThumb
  },
  {
    id: 'positron',
    name: 'Light',
    description: 'Light minimal',
    style: 'https://tiles.openfreemap.org/styles/positron',
    thumbnail: PositronThumb
  },
  {
    id: 'bright',
    name: 'Streets',
    description: 'Vibrant OSM',
    style: 'https://tiles.openfreemap.org/styles/bright',
    thumbnail: BrightThumb
  },
  {
    id: 'liberty',
    name: 'Liberty',
    description: 'Maritime blue',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    thumbnail: LibertyThumb
  },
  {
    id: 'osm-raster',
    name: 'OpenStreetMap',
    description: 'Raster tiles',
    style: {
      version: 8 as const,
      sources: {
        'osm-raster': {
          type: 'raster' as const,
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      },
      layers: [{ id: 'osm-raster-layer', type: 'raster' as const, source: 'osm-raster' }]
    } as any,
    thumbnail: OsmThumb
  },
  {
    id: 'topo',
    name: 'Outdoors',
    description: 'Terrain view',
    style: {
      version: 8 as const,
      sources: {
        'topo-raster': {
          type: 'raster' as const,
          tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
        }
      },
      layers: [{ id: 'topo-raster-layer', type: 'raster' as const, source: 'topo-raster' }]
    } as any,
    thumbnail: TopoThumb
  },
];

interface LayerManagerProps {
  layers: LayerConfig[];
  onToggle: (layerId: string) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  onColorChange: (layerId: string, color: [number, number, number]) => void;
  onRemove: (layerId: string) => void;
  onOpenCatalog: () => void;
  onFilterChange: (layerId: string, filters: any) => void;
  onOpenTable: (layerId: string) => void;
  onVizChange: (layerId: string, vizField?: string, palette?: string[], displayField?: string, tooltipFields?: string[]) => void;
  onPointSizeChange: (layerId: string, pointSize: number) => void;
  onStrokedChange: (layerId: string, stroked: boolean) => void;
  activeTableLayerId?: string;
  schema: Record<string, any[]>;
  onBaseMapChange: (style: string | any) => void;
  baseMapStyle: string | any;

  onLineWidthChange?: (layerId: string, width: number) => void;
  onStrokeColorChange?: (layerId: string, color: [number, number, number]) => void;


  onBulkToggle?: (visible: boolean) => void;
  onBulkRemove?: () => void;
  onZoomToLayer?: (layerId: string) => void;
  onLabelChange?: (layerId: string, labelProps: Partial<Pick<LayerConfig, 'labelEnabled' | 'labelField' | 'labelSize' | 'labelColor'>>) => void;
}

const LayerManager: React.FC<LayerManagerProps> = ({
  layers,
  onToggle,
  onOpacityChange,
  onColorChange,
  onRemove,
  onOpenCatalog,
  onFilterChange,
  onOpenTable,
  onVizChange,
  onPointSizeChange,
  onStrokedChange,
  activeTableLayerId,
  schema,
  onBaseMapChange,
  baseMapStyle,

  onLineWidthChange,
  onStrokeColorChange,


  onBulkToggle,
  onBulkRemove,
  onZoomToLayer,
  onLabelChange
}) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'filters' | 'fields'>('layers');
  const [expandedFilters, setExpandedFilters] = useState<string | null>(null);
  const [openPaletteId, setOpenPaletteId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [statsCache, setStatsCache] = useState<Record<string, any>>({});
  const [expandedLayerFilters, setExpandedLayerFilters] = useState<Record<string, boolean>>({});
  const [expandedLayerFields, setExpandedLayerFields] = useState<Record<string, boolean>>({});
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState<string | null>(null); // layerId or null
  
  const getDerivedSchema = (layer: LayerConfig, baseSchema: any[]) => {
    if (layer.data && layer.data.length > 0) {
      const firstRow = layer.data[0];
      return Object.keys(firstRow).map(name => {
        const val = firstRow[name];
        const isNum = typeof val === 'number' || (typeof val === 'bigint');
        return {
          name,
          type: isNum ? 'numerical' : 'categorical',
          raw_type: isNum ? 'DOUBLE' : 'VARCHAR'
        };
      });
    }
    if (layer.geoData) {
      const features = layer.geoData.type === 'FeatureCollection' ? layer.geoData.features :
                       layer.geoData.type === 'Feature' ? [layer.geoData] : [];
      if (features.length > 0 && features[0].properties) {
        const props = features[0].properties;
        return Object.keys(props).map(name => {
          const val = props[name];
          const isNum = typeof val === 'number' || (typeof val === 'bigint');
          return {
            name,
            type: isNum ? 'numerical' : 'categorical',
            raw_type: isNum ? 'DOUBLE' : 'VARCHAR'
          };
        });
      }
    }
    return baseSchema || [];
  };

  const GEO_FIELDS = ['geom', 'latitude', 'longitude', 'lat', 'lon', 'x', 'y'];
  
  const allPalettes = getAllPalettes();

  // Load field stats (min/max or distinct values)
  const getFieldStats = async (layer: LayerConfig, field: string, type: string) => {
    const cacheKey = `${layer.id}-${field}`;
    if (statsCache[cacheKey]) return statsCache[cacheKey];

    try {
      let stats: any = {};
      const isNum = ['DOUBLE', 'INT', 'FLOAT', 'DECIMAL', 'REAL', 'BIGINT', 'NUMERICAL'].some(t => type.toUpperCase().includes(t));

      if (layer.duckdbTable) {
        if (isNum) {
          const res = await queryDuckDB(`SELECT MIN("${field}") as min_val, MAX("${field}") as max_val FROM ${layer.duckdbTable}`);
          stats = { min: res[0]?.min_val, max: res[0]?.max_val };
        } else {
          const res = await queryDuckDB(`SELECT DISTINCT "${field}" as val FROM ${layer.duckdbTable} WHERE "${field}" IS NOT NULL LIMIT 20`);
          stats = { distinct: res.map((r: any) => r.val) };
        }
      } else if (layer.data) {
        const values = layer.data.map(d => d[field]).filter(v => v != null && v !== '' && !Number.isNaN(v));
        if (values.length > 0) {
          if (isNum) {
            stats = { min: Math.min(...values), max: Math.max(...values) };
          } else {
            stats = { distinct: Array.from(new Set(values)).slice(0, 20) };
          }
        }
      }
      
      setStatsCache(prev => ({ ...prev, [cacheKey]: stats }));
      return stats;
    } catch (err) {
      console.error("Failed to fetch stats", err);
      return {};
    }
  };

  const toggleFilters = (id: string) => {
    setExpandedFilters(expandedFilters === id ? null : id);
  };



  return (
    <>
      {/* Collapse Toggle Button */}
      <div className={`fixed top-4 z-50 transition-all duration-300 ease-in-out ${isCollapsed ? 'left-4' : 'left-84'}`}>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-8 h-12 bg-white rounded-lg shadow-xl border border-gray-200 flex items-center justify-center hover:bg-blue-50 transition-colors group"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg className={`w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className={`fixed top-4 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl w-80 z-40 flex flex-col h-[95vh] border border-gray-200 overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? '-left-84' : 'left-4'}`}>
      {/* Header: horizontal logo (homepage link) on the left + Add Data on the right */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0" style={{ minHeight: '68px' }}>

        {/* Logo — links to project homepage */}
        <a
          href="https://spatiotemporal.languagescience.jp/"
          target="_blank"
          rel="noopener noreferrer"
          title="Visit Spatiotemporal Linguistics"
          className="relative group flex items-center"
          style={{ overflow: 'visible', zIndex: 10 }}
        >
          {/* Hover halo — expands with the zoom */}
          <span
            className="absolute -inset-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(56,189,248,0.14) 0%, transparent 70%)' }}
          />
          <img
            src="/logo_horizontal.png"
            alt="Spatiotemporal Linguistics"
            draggable={false}
            className="relative h-12 w-auto object-contain transition-all duration-300 ease-out group-hover:scale-[1.35]"
            style={{
              filter: 'drop-shadow(0 1px 4px rgba(56,189,248,0.22))',
              transformOrigin: 'left center',  /* zoom anchored to left so it doesn't overlap the button */
            }}
          />
        </a>

        {/* Right side: label stack + Add Data */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onOpenCatalog}
            className="bg-blue-600 text-white text-[10px] px-3 py-1.5 rounded-lg hover:bg-blue-700 font-black transition-all shadow-lg shadow-blue-200 uppercase"
          >
            + Add Data
          </button>
          <span className="text-[8px] font-black text-gray-300 uppercase tracking-[0.18em]">Layer Manager</span>
        </div>

      </div>

      {/* Tabs Header */}
      <div className="flex border-b bg-white">
        <button 
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'layers' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Layers
          {activeTab === 'layers' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('fields')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'fields' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Tooltip
          {activeTab === 'fields' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('filters')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'filters' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Filters
          {activeTab === 'filters' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'layers' ? (
        <>
          {layers.length > 0 && (
            <div className="px-3 py-2 border-b bg-white flex items-center justify-between">
                <div className="flex items-center space-x-1">
                    <button 
                        onClick={() => onBulkToggle?.(true)}
                        className="text-[9px] font-black text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors uppercase"
                    >
                        Show All
                    </button>
                    <button 
                        onClick={() => onBulkToggle?.(false)}
                        className="text-[9px] font-black text-gray-500 hover:bg-gray-100 px-2 py-1 rounded-md transition-colors uppercase"
                    >
                        Hide All
                    </button>
                </div>
                <button 
                    onClick={() => {
                      if (window.confirm('Remove all sources and layers?')) {
                          onBulkRemove?.();
                      }
                    }}
                    className="text-[9px] font-black text-red-500 hover:bg-red-50 px-2 py-1 rounded-md transition-colors uppercase"
                >
                    Clear All
                </button>
            </div>
          )}

          {/* Base Map Selector */}
          <div className="px-3 pt-3 pb-2 border-b bg-gray-50/50">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Base Map</label>
              <span className="text-[9px] font-black text-orange-500 uppercase tracking-wide">
                {BASEMAP_STYLES.find(s => JSON.stringify(s.style) === JSON.stringify(baseMapStyle))?.name || 'Custom'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {BASEMAP_STYLES.map(style => {
                const isActive = JSON.stringify(style.style) === JSON.stringify(baseMapStyle);
                const Thumb = style.thumbnail;
                return (
                  <button
                    key={style.id}
                    onClick={() => onBaseMapChange(style.style)}
                    title={style.description}
                    style={isActive ? { boxShadow: '0 0 0 2.5px #f97316, 0 2px 8px rgba(249,115,22,0.35)' } : {}}
                    className={`relative group overflow-hidden rounded-lg transition-all duration-150 focus:outline-none ${
                      isActive ? 'rounded-lg' : 'hover:scale-[1.03]'
                    }`}
                  >
                    {/* Map thumbnail */}
                    <div className="h-15 w-full overflow-hidden">
                      <Thumb />
                    </div>
                    {/* Persistent dark gradient overlay */}
                    <div className={`absolute inset-0 transition-opacity duration-150 ${
                      isActive
                        ? 'opacity-0'
                        : 'opacity-60 group-hover:opacity-20'
                    }`}
                      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)' }}
                    />
                    {/* Always-visible dark footer gradient for legibility */}
                    <div className="absolute inset-x-0 bottom-0 h-8"
                      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
                    />
                    {/* Bold white label — centered at bottom */}
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1.5">
                      <span className="text-[9px] font-black text-white uppercase tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] leading-none">
                        {style.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-visible min-h-0 p-3 space-y-3 custom-scrollbar">
        {layers.length === 0 && (
          <div className="text-center py-10">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Empty Workspace</p>
          </div>
        )}
        
        {layers.map(layer => {
          const isFilterExpanded = expandedFilters === layer.id;
          
          // Derive schema from data if available, otherwise fallback to prop
          const layerSchema = getDerivedSchema(layer, schema[layer.id]);

          const selectedField = layerSchema.find(f => f.name === layer.vizField);
          const hasGeoData = !!layer.geoData;
          const isPoint = !hasGeoData || 
            (layer.geoData.type === 'FeatureCollection' ? layer.geoData.features.some((f: any) => f.geometry.type.includes('Point')) : layer.geoData.type.includes('Point'));
          const isLine = hasGeoData && 
            (layer.geoData.type === 'FeatureCollection' ? layer.geoData.features.some((f: any) => f.geometry.type.includes('LineString')) : layer.geoData.type.includes('LineString'));
          const isPolygon = hasGeoData && 
            (layer.geoData.type === 'FeatureCollection' ? layer.geoData.features.some((f: any) => f.geometry.type.includes('Polygon')) : layer.geoData.type.includes('Polygon'));

          return (
            <div key={layer.id} className={`border rounded-xl p-3 transition-all ${layer.visible ? 'bg-white shadow-sm border-gray-200' : 'bg-gray-50/50 opacity-60 border-transparent scale-[0.98]'}`}>
              <div className="flex items-center justify-between group">
                 <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => onToggle(layer.id)}
                      className="w-5 h-5 rounded-md text-blue-600 focus:ring-blue-500 cursor-pointer border-gray-300 disabled:opacity-20"
                      disabled={!layer.isSpatial}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[13px] font-black tracking-tight truncate leading-tight ${!layer.isSpatial ? 'text-gray-400' : 'text-gray-800'}`} title={layer.dataset}>{layer.dataset}</span>
                        {layer.isLoading && (
                            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        )}
                        {!layer.isLoading && !layer.isSpatial && (
                            <span className="bg-amber-100 text-amber-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm border border-amber-200">Non-Spatial</span>
                        )}
                      </div>
                      <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">
                        {layer.type.replace('_', ' ')} • {layer.data?.length || 0} markers
                      </span>
                    </div>
                 </div>

                  <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onOpenTable(layer.id)}
                      className={`p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${activeTableLayerId === layer.id ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}
                      title="Open Data Table"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </button>
                    <button 
                      onClick={() => onZoomToLayer?.(layer.id)}
                      disabled={!layer.isSpatial || (!layer.geoData && (!layer.data || layer.data.length === 0))}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-20"
                      title="Zoom to Extent"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z M10 7v6m-3-3h6" /></svg>
                    </button>
                    <button 
                      onClick={() => toggleFilters(layer.id)}
                      className={`p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${isFilterExpanded ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}
                      title="Visualization & Filters"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6v2m6 10v2" /></svg>
                    </button>
                    <button 
                      onClick={() => onRemove(layer.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Remove Layer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                 </div>
              </div>
              {layer.visible && isFilterExpanded && (
                <div className="mt-3 space-y-4 border-t pt-3 animate-in slide-in-from-top-2 duration-200">

                  {/* Visualization Section */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Visualize by Field</label>
                    <select 
                      value={layer.vizField || ''} 
                      onChange={(e) => onVizChange(layer.id, e.target.value || undefined, layer.palette)}
                      className="w-full px-2 py-1.5 border rounded-lg text-[11px] bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">None (Single Color)</option>
                      {layerSchema.filter(f => f.name !== 'geom' && f.name !== 'Latitude' && f.name !== 'Longitude').map(f => (
                        <option key={f.name} value={f.name}>{f.name} ({f.type})</option>
                      ))}
                    </select>

                    <div className="space-y-1.5 pt-1 border-t mt-2">
                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
                             {layer.vizField ? `Color Palette (${selectedField?.type || 'Unknown'})` : 'Color Palette'}
                         </label>
                         
                         <div className="relative">
                            <button 
                                onClick={() => setOpenPaletteId(openPaletteId === layer.id ? null : layer.id)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border rounded-lg hover:border-blue-400 transition-all group"
                            >
                                <div className="flex items-center space-x-3 overflow-hidden">
                                     <div className="flex h-3 w-16 rounded-sm overflow-hidden shrink-0 shadow-sm border border-black/5">
                                        {layer.palette ? layer.palette.slice(0, 8).map((c, i) => <div key={i} className="flex-1" style={{backgroundColor: c}} />) : <div className="flex-1 bg-gray-200" />}
                                     </div>
                                     <span className="text-[10px] font-bold text-gray-600 truncate">{allPalettes.find(p => JSON.stringify(p.colors) === JSON.stringify(layer.palette))?.name || 'Select Palette...'}</span>
                                </div>
                                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${openPaletteId === layer.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                            </button>

                            {openPaletteId === layer.id && (
                                <ColorPalettePanel
                                    currentPalette={layer.palette}
                                    fieldType={selectedField?.type}
                                    onPaletteChange={(colors) => {
                                        onVizChange(layer.id, layer.vizField, colors, layer.displayField, layer.tooltipFields);
                                    }}
                                    onClose={() => setOpenPaletteId(null)}
                                />
                            )}
                         </div>
                    </div>
                  </div>

                   {/* Visual Settings Section */}
                   <div className="space-y-4 py-3 border-t border-b bg-gray-50/30 px-2">
                      {!layer.vizField && (
                          <div className="space-y-2">
                             <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Base Color</label>
                                {(isLine || isPolygon) && (
                                    <button 
                                        onClick={() => onStrokeColorChange?.(layer.id, [255, 255, 255])}
                                        className="text-[8px] font-black text-blue-600 uppercase hover:underline"
                                    >
                                        Reset Stroke
                                    </button>
                                )}
                             </div>
                             <div className="flex flex-wrap gap-2 items-center">
                                {[
                                    [255, 120, 0], [0, 200, 100], [0, 120, 255], 
                                    [255, 50, 50], [150, 10, 150], [255, 200, 0], 
                                    [0, 0, 0], [255, 255, 255]
                                ].map((c: any, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => onColorChange(layer.id, c)}
                                        className={`w-6 h-6 rounded-lg border border-gray-200 transition-all hover:scale-110 shadow-sm ${JSON.stringify(layer.color) === JSON.stringify(c) ? 'ring-2 ring-blue-500 scale-110' : ''}`}
                                        style={{backgroundColor: `rgb(${c[0]}, ${c[1]}, ${c[2]})`}}
                                    />
                                ))}
                                <input
                                  type="color"
                                  value={`#${layer.color.map((c: number) => c.toString(16).padStart(2, '0')).join('')}`}
                                  onChange={(e) => {
                                    const hex = e.target.value;
                                    const r = parseInt(hex.slice(1, 3), 16);
                                    const g = parseInt(hex.slice(3, 5), 16);
                                    const b = parseInt(hex.slice(5, 7), 16);
                                    onColorChange(layer.id, [r, g, b]);
                                  }}
                                  className="w-6 h-6 rounded-lg border border-dashed border-gray-300 cursor-pointer p-0 overflow-hidden hover:border-blue-400 transition-colors"
                                  title="Custom color"
                                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                                />
                             </div>
                          </div>
                      )}

                      {/* Labels Section */}
                      <div className="space-y-3 pt-3 border-t border-gray-100">
                         <div className="flex items-center justify-between">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Labels</label>
                            <button 
                                onClick={() => onLabelChange?.(layer.id, { labelEnabled: !layer.labelEnabled })}
                                className={`w-8 h-4 rounded-full transition-colors relative ${layer.labelEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${layer.labelEnabled ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                         </div>

                         {layer.labelEnabled && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                               <div className="space-y-1.5">
                                  <label className="text-[8px] font-bold text-gray-400 uppercase">Label Field</label>
                                  <select 
                                    value={layer.labelField || ''} 
                                    onChange={(e) => onLabelChange?.(layer.id, { labelField: e.target.value })}
                                    className="w-full px-2 py-1.5 border rounded-lg text-[10px] bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                  >
                                    <option value="">Select Field...</option>
                                    {layerSchema.filter(f => f.name !== 'geom' && f.name !== 'Latitude' && f.name !== 'Longitude').map(f => (
                                      <option key={f.name} value={f.name}>{f.name}</option>
                                    ))}
                                  </select>
                               </div>

                               <div className="flex items-center space-x-4">
                                  <div className="flex-1 space-y-1">
                                     <label className="text-[8px] font-bold text-gray-400 uppercase">Size</label>
                                     <input
                                        type="range" min="8" max="32" step="1"
                                        value={layer.labelSize || 14}
                                        onChange={(e) => onLabelChange?.(layer.id, { labelSize: parseInt(e.target.value) })}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                     />
                                  </div>
                                  <span className="text-[10px] font-mono mt-2 text-gray-500">{layer.labelSize || 14}px</span>
                               </div>



                               <div className="space-y-1.5">
                                  <label className="text-[8px] font-bold text-gray-400 uppercase">Text Color</label>
                                  <div className="flex flex-wrap gap-1.5">
                                     {[
                                         [255, 255, 255], [0, 0, 0], [255, 120, 0], 
                                         [0, 200, 100], [0, 120, 255], [255, 50, 50]
                                     ].map((c: any, i) => (
                                         <button 
                                             key={i}
                                             onClick={() => onLabelChange?.(layer.id, { labelColor: c })}
                                             className={`w-4 h-4 rounded-md border border-gray-100 shadow-sm transition-all hover:scale-110 ${JSON.stringify(layer.labelColor || [255, 255, 255]) === JSON.stringify(c) ? 'ring-2 ring-blue-500 scale-110' : ''}`}
                                             style={{backgroundColor: `rgb(${c[0]}, ${c[1]}, ${c[2]})`}}
                                         />
                                     ))}
                                  </div>
                               </div>
                            </div>
                         )}
                      </div>

                      {/* Point Specific Controls */}
                      {isPoint && (
                          <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                 <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Marker Size</span>
                                 <div className="flex items-center space-x-2 flex-1 ml-4 text-gray-500">
                                    <input
                                        type="range" min="1" max="50" step="1"
                                        value={layer.pointSize || 6}
                                        onChange={(e) => onPointSizeChange(layer.id, parseInt(e.target.value))}
                                        className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <span className="text-[10px] font-mono w-6">{layer.pointSize || 6}</span>
                                 </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Outline (Stroked)</span>
                                <button 
                                    onClick={() => onStrokedChange(layer.id, !layer.stroked)}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${layer.stroked ? 'bg-blue-600' : 'bg-gray-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${layer.stroked ? 'left-4.5' : 'left-0.5'}`} />
                                </button>
                              </div>
                          </div>
                      )}

                      {/* Line Specific Controls */}
                      {isLine && (
                          <div className="space-y-3 pt-2 border-t border-gray-100">
                              <div className="flex items-center justify-between">
                                 <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Line Width</span>
                                 <div className="flex items-center space-x-2 flex-1 ml-4 text-gray-500">
                                    <input
                                        type="range" min="1" max="20" step="1"
                                        value={layer.lineWidth || 2}
                                        onChange={(e) => onLineWidthChange?.(layer.id, parseInt(e.target.value))}
                                        className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <span className="text-[10px] font-mono w-6">{layer.lineWidth || 2}</span>
                                 </div>
                              </div>

                          </div>
                      )}



                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Global Opacity</span>
                        <div className="flex items-center space-x-2 flex-1 ml-4 text-gray-500">
                            <input
                                type="range" min="0" max="1" step="0.01"
                                value={layer.opacity}
                                onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                                className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <span className="text-[10px] font-mono w-6">{Math.round(layer.opacity * 100)}</span>
                        </div>
                      </div>
                   </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
        </>
      ) : activeTab === 'fields' ? (
        <div className="flex-1 overflow-y-auto overflow-x-visible min-h-0 p-4 space-y-5 custom-scrollbar bg-gray-50/30">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tooltip Configuration</span>
          </div>

          {layers.filter(l => l.visible).length === 0 && (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">No visible layers to configure</p>
            </div>
          )}

          {layers.filter(l => l.visible).map(layer => {
            const isExpanded = expandedLayerFields[layer.id];
            const layerSchema = getDerivedSchema(layer, schema[layer.id]);

            return (
              <div key={layer.id} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <button
                  onClick={() => setExpandedLayerFields(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-t-xl"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `rgb(${layer.color[0]}, ${layer.color[1]}, ${layer.color[2]})` }} />
                    <span className="text-[11px] font-black text-gray-700 truncate uppercase">{layer.dataset}</span>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                {isExpanded && (
                  <div className="px-4 py-4 border-t space-y-5 bg-gray-50/50">
                    {/* Display Header Field */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Display Header Field</label>
                      <select
                        value={layer.displayField || ''}
                        onChange={(e) => onVizChange(layer.id, layer.vizField, layer.palette, e.target.value || undefined, layer.tooltipFields)}
                        className="w-full px-2.5 py-2 border rounded-lg text-[11px] bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Default (Name/ID)</option>
                        {layerSchema.filter(f => f.name !== 'geom' && f.name !== 'Latitude' && f.name !== 'Longitude').map(f => (
                          <option key={f.name} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Visible Tooltip Fields */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Visible Tooltip Fields</label>
                      <div className="max-h-40 overflow-auto border rounded-lg bg-white p-2.5 space-y-1">
                        {layerSchema.filter(f => !['geom', 'Latitude', 'Longitude'].includes(f.name)).map(f => {
                          const isVisible = !layer.tooltipFields || layer.tooltipFields.includes(f.name);
                          return (
                            <label key={f.name} className="flex items-center space-x-2.5 cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={(e) => {
                                  const current = layer.tooltipFields || layerSchema.map(s => s.name).filter(n => !['geom', 'Latitude', 'Longitude'].includes(n));
                                  const updated = e.target.checked
                                    ? [...current, f.name]
                                    : current.filter(n => n !== f.name);
                                  onVizChange(layer.id, layer.vizField, layer.palette, layer.displayField, updated);
                                }}
                                className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                              />
                              <span className={`text-[10px] ${isVisible ? 'text-gray-700 font-bold' : 'text-gray-400'} truncate`}>{f.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-visible min-h-0 p-4 space-y-5 custom-scrollbar bg-gray-50/30">
          <div className="flex items-center justify-between px-1">
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Filters</span>
             <button 
               onClick={() => {
                 layers.forEach(l => onFilterChange(l.id, {}));
               }}
               className="text-[9px] font-black text-blue-600 hover:underline uppercase"
             >
               Clear All
             </button>
          </div>

          {layers.filter(l => l.visible).length === 0 && (
            <div className="text-center py-12">
               <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
               </div>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">No visible layers to filter</p>
            </div>
          )}

          {layers.filter(l => l.visible).map(layer => {
            const isExpanded = expandedLayerFilters[layer.id];
            const layerSchema = getDerivedSchema(layer, schema[layer.id]);
            const filterable = layerSchema.filter(f => !GEO_FIELDS.includes(f.name.toLowerCase()));
            const activeFilterFields = Object.keys(layer.filters || {}).filter(k => k !== 'search' && k !== 'parameter_filter' && k !== 'form_filter' && k !== 'coords_lat' && k !== 'coords_lon');
            const availableFields = filterable.filter(f => !activeFilterFields.includes(f.name));
            const isSelectorOpen = fieldSelectorOpen === layer.id;
            const activeFilterCount = activeFilterFields.length;
            
            return (
              <div key={layer.id} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <button 
                  onClick={() => setExpandedLayerFilters(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-t-xl"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `rgb(${layer.color[0]}, ${layer.color[1]}, ${layer.color[2]})` }} />
                    <span className="text-[11px] font-black text-gray-700 truncate uppercase">{layer.dataset}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {activeFilterCount > 0 && (
                      <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 py-4 border-t space-y-4 bg-gray-50/50">
                    {/* Existing active filter rows */}
                    {activeFilterFields.map(fieldName => {
                      const fieldMeta = filterable.find(f => f.name === fieldName);
                      if (!fieldMeta) return null;
                      const isNum = ['DOUBLE', 'INT', 'FLOAT', 'DECIMAL', 'REAL', 'BIGINT', 'NUMERICAL'].some(t => fieldMeta.type.toUpperCase().includes(t));
                      const currentFilter = layer.filters?.[fieldName];

                      return (
                        <div key={fieldName} className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3.5 space-y-3 relative group/filter">
                          {/* Header row: field name + type + delete */}
                          <div className="flex items-center justify-between min-h-7">
                            <div className="flex items-center space-x-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${isNum ? 'bg-emerald-500' : 'bg-violet-500'}`} />
                              <span className="text-[10px] font-black text-gray-600 uppercase tracking-wide">{fieldName}</span>
                              <span className="text-[8px] text-gray-300 font-medium bg-gray-50 px-1.5 py-0.5 rounded">{fieldMeta.type}</span>
                            </div>
                            <button
                              onClick={() => {
                                const updated = { ...layer.filters };
                                delete updated[fieldName];
                                onFilterChange(layer.id, updated);
                              }}
                              className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/filter:opacity-100"
                              title="Remove filter"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>

                          {/* Filter control */}
                          {isNum ? (
                            <NumericFilter 
                              field={fieldName}
                              value={currentFilter}
                              layer={layer}
                              onChange={(val) => onFilterChange(layer.id, { ...layer.filters, [fieldName]: val })}
                            />
                          ) : (
                            <StringFilter 
                              field={fieldName}
                              value={currentFilter}
                              getStats={() => getFieldStats(layer, fieldName, fieldMeta.type)}
                              onChange={(val) => onFilterChange(layer.id, { ...layer.filters, [fieldName]: val })}
                              duckdbTable={layer.duckdbTable}
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* + Add Filter button + dropdown */}
                    {availableFields.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setFieldSelectorOpen(isSelectorOpen ? null : layer.id)}
                          className="w-full flex items-center justify-center space-x-2 py-3.5 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-all hover:bg-blue-50/30"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                          <span className="text-[10px] font-black uppercase tracking-wider">Add Filter</span>
                        </button>

                        {isSelectorOpen && (
                          <div className="absolute top-full left-0 right-0 z-100 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-auto py-1 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-2 border-b">
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Select Field</span>
                            </div>
                            {availableFields.map(field => {
                              const isNum = ['DOUBLE', 'INT', 'FLOAT', 'DECIMAL', 'REAL', 'BIGINT', 'NUMERICAL'].some(t => field.type.toUpperCase().includes(t));
                              return (
                                <button
                                  key={field.name}
                                  onClick={() => {
                                    // Add empty filter for this field - control will initialize with defaults
                                    const initVal = isNum ? { type: 'range' } : { type: 'contains', val: '' };
                                    onFilterChange(layer.id, { ...layer.filters, [field.name]: initVal });
                                    setFieldSelectorOpen(null);
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 transition-colors text-left group/item"
                                >
                                  <div className="flex items-center space-x-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isNum ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                                    <span className="text-[11px] font-bold text-gray-600 group-hover/item:text-blue-600">{field.name}</span>
                                  </div>
                                  <span className="text-[9px] text-gray-300 font-medium">{field.type}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {activeFilterCount === 0 && availableFields.length === 0 && (
                      <p className="text-[10px] text-gray-400 text-center py-2 italic">No filterable fields available</p>
                    )}

                    {/* Clear layer filters */}
                    {activeFilterCount > 0 && (
                      <div className="pt-3 mt-1 flex justify-end border-t">
                         <button 
                           onClick={() => onFilterChange(layer.id, {})}
                           className="text-[9px] font-black text-gray-400 hover:text-red-500 uppercase px-2 py-1 transition-colors"
                         >
                           Clear Filters
                         </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
};

// String filter sub-component with suggestions
const StringFilter: React.FC<{
  field: string, 
  value: any, 
  getStats: () => Promise<any>, 
  onChange: (val: any) => void,
  duckdbTable?: string
}> = ({ field, value, getStats, onChange, duckdbTable }) => {
  const [stats, setStats] = useState<any>(null);
  const [inputValue, setInputValue] = useState(value?.val || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    getStats().then(s => {
      setStats(s);
      if (s.distinct) setSuggestions(s.distinct);
    });
  }, []);

  const handleInput = (val: string) => {
    setInputValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (val.length > 1 && duckdbTable) {
        const res = await queryDuckDB(`SELECT DISTINCT "${field}" as v FROM ${duckdbTable} WHERE "${field}" ILIKE '%${val}%' LIMIT 10`);
        setSuggestions(res.map((r: any) => r.v));
      } else if (stats?.distinct) {
        setSuggestions(stats.distinct.filter((s: string) => s.toLowerCase().includes(val.toLowerCase())));
      }
      onChange({ type: 'contains', val });
    }, 300);
  };

  return (
    <div className="relative">
      <input 
        type="text"
        value={inputValue}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setShowSuggest(true)}
        onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
        className="w-full px-3 py-2.5 border rounded-lg text-[11px] bg-white shadow-inner outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Filter by value..."
      />
      {showSuggest && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-100 mt-1.5 bg-white border rounded-xl shadow-2xl max-h-44 overflow-auto py-1 animate-in fade-in zoom-in-95 duration-100">
           {suggestions.map((s, i) => (
             <button 
               key={i}
               onClick={() => {
                 setInputValue(s);
                 onChange({ type: 'equals', val: s });
               }}
               className="w-full text-left px-3 py-2 text-[11px] hover:bg-blue-50 text-gray-600 truncate"
             >
               {s}
             </button>
           ))}
        </div>
      )}
    </div>
  );
};

export default LayerManager;