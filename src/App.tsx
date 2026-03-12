import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { queryDuckDB, getDuckDB } from './utils/duckdb';
import { WebMercatorViewport } from '@math.gl/web-mercator';
import Map from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ScatterplotLayer, GeoJsonLayer, TextLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { tableFromIPC } from 'apache-arrow';
import { Rnd } from 'react-rnd';
import LayerManager from './components/LayerManager';
import DetailWindow from './components/DetailWindow';
import ChatInterface from './components/ChatInterface';
import DataTable from './components/DataTable';
import Catalog from './components/Catalog';
import LegendPanel from './components/LegendPanel';
import { API_BASE_URL } from './config';
import './App.css';

import { EditableGeoJsonLayer } from '@deck.gl-community/editable-layers';
import { DrawPolygonMode, ViewMode } from '@deck.gl-community/editable-layers';

import { createColorScale, getAllPalettes } from './utils/ColorMapper';

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
  filteredData?: any[];
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

interface DetailWindowData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  layerId: string;
  lon: number;
  lat: number;
}

// No API token needed — using OpenFreeMap (open-source, free)

import { filterData } from './utils/filterUtils';

function App() {
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [detailWindows, setDetailWindows] = useState<DetailWindowData[]>([]);
  const [scales, setScales] = useState<Record<string, any>>({});
  const [schema, setSchema] = useState<Record<string, any[]>>({});
  const [uploadedDatasets, setUploadedDatasets] = useState<any[]>([]);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 2,
    pitch: 0,
    bearing: 0
  });
  const [openTableLayerIds, setOpenTableLayerIds] = useState<string[]>([]);
  const [activeTableLayerId, setActiveTableLayerId] = useState<string | null>(null);
  const [showTableOverlay, setShowTableOverlay] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [windowPositions, setWindowPositions] = useState<Record<string, {x: number, y: number, w: number, h: number}>>({});
  const [baseMapStyle, setBaseMapStyle] = useState<string | any>('https://tiles.openfreemap.org/styles/dark');

  // Polygon Drawing State
  const [polygonFeature, setPolygonFeature] = useState<any | null>(null);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);

  const viewport = useMemo(() => {
    return new WebMercatorViewport({
        ...viewState,
        width: window.innerWidth,
        height: window.innerHeight
    });
  }, [viewState]);

  // Close chat on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isChatOpen) setIsChatOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isChatOpen]);

  // Sync Data and Color Scales
  useEffect(() => {
    layers.forEach(l => {
        if (l.visible && !l.data && !l.isLoading) {
            setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, isLoading: true } : layer));
            
            const params = new URLSearchParams({
                data_type: l.type,
                dataset: l.dataset
            });
            
            if (l.filters?.glosses && Array.isArray(l.filters.glosses)) {
                l.filters.glosses.forEach((g: string) => params.append('glosses', g));
            }
            
            const url = `${API_BASE_URL}/full_data?${params}`;
            
            fetch(url)
                .then(res => res.arrayBuffer())
                .then(buffer => {
                    try {
                        const table = tableFromIPC(new Uint8Array(buffer));
                        const fields = table.schema.fields.map(f => f.name);
                        
                        // Use toArray() and map to plain objects
                        const data = table.toArray().map((row: any) => {
                            const obj: any = {};
                            fields.forEach(f => { 
                                let val = row[f];
                                // Convert BigInt to Number for Deck.gl/D3 compatibility
                                if (typeof val === 'bigint') {
                                    val = Number(val);
                                }
                                obj[f] = val; 
                            });
                            return obj;
                        });
                        
                        // Check for spatial columns
                        const spatialKeys = ['Longitude', 'Latitude', 'longitude', 'latitude', 'Lon', 'Lat', 'lon', 'lat', 'lng', 'Lng', 'x', 'X', 'y', 'Y'];
                        const hasSpatialCols = fields.some(f => spatialKeys.includes(f));

                        const duckdbTable = `layer_${l.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        getDuckDB().then(async ({conn}: any) => {
                             try {
                                 await conn.insertArrowTable(table, { name: `tmp_${duckdbTable}` });
                                 await conn.query(`CREATE TABLE ${duckdbTable} AS SELECT * FROM tmp_${duckdbTable}`);
                                 
                                 setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, data, isLoading: false, isSpatial: hasSpatialCols, duckdbTable } : layer));
                             } catch (e: any) {
                                 console.error("DuckDB insert error:", e);
                                 setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, data, isLoading: false, isSpatial: hasSpatialCols } : layer));
                             }
                        });
                        
                        if (l.vizField && l.palette && data.length > 0) {
                            const values = data.map((d: any) => d[l.vizField!]).filter((v: any) => v != null);
                            if (values.length > 0) {
                                const firstVal = values[0];
                                const isNum = typeof firstVal === 'number' || (typeof firstVal === 'string' && !isNaN(parseFloat(firstVal)) && isFinite(Number(firstVal)));
                                const scale = createColorScale(isNum ? 'numerical' : 'categorical', values, l.palette!);
                                setScales(prev => ({ ...prev, [l.id]: scale }));
                            }
                        }
                    } catch (e) {
                        console.error(`[Arrow] Binary parse error for ${l.dataset}:`, e);
                        setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, isLoading: false } : layer));
                    }
                })
                .catch(err => {
                    console.error(`[Arrow] Network error for ${l.dataset}:`, err);
                    setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, isLoading: false } : layer));
                });
        } else if (l.visible && l.data && l.vizField && l.palette && !scales[l.id]) {
            const values = l.data.map((d: any) => d[l.vizField!]).filter((v: any) => v != null);
            if (values.length > 0) {
                const firstVal = values[0];
                const isNum = typeof firstVal === 'number' || (typeof firstVal === 'string' && !isNaN(parseFloat(firstVal)) && isFinite(Number(firstVal)));
                const scale = createColorScale(isNum ? 'numerical' : 'categorical', values, l.palette!);
                setScales(prev => ({ ...prev, [l.id]: scale }));
            }
        } else if (l.visible && !l.data && l.geoData && l.vizField && l.palette && !scales[l.id]) {
            // Build scale from GeoJSON feature properties
            const features = l.geoData.type === 'FeatureCollection' ? l.geoData.features :
                             l.geoData.type === 'Feature' ? [l.geoData] : [];
            const values = features.map((f: any) => f.properties?.[l.vizField!]).filter((v: any) => v != null);
            if (values.length > 0) {
                const firstVal = values[0];
                const isNum = typeof firstVal === 'number' || (typeof firstVal === 'string' && !isNaN(parseFloat(firstVal)) && isFinite(Number(firstVal)));
                const scale = createColorScale(isNum ? 'numerical' : 'categorical', values, l.palette!);
                setScales(prev => ({ ...prev, [l.id]: scale }));
            }
        }
    });
  }, [layers.map(l => `${l.id}-${l.visible}-${l.vizField}-${l.palette?.join(',')}-${!!l.data}-${!!l.geoData}`).join('|')]);

  const fetchingSchemas = useRef<Set<string>>(new Set());

  // Sync Schema
  useEffect(() => {
    layers.forEach(l => {
        if (!schema[l.id] && !fetchingSchemas.current.has(l.id)) {
            if (l.type.startsWith('user_upload') && l.data && l.data.length > 0) {
                // Infer schema from user data
                const firstRow = l.data[0];
                const cols = Object.keys(firstRow).map(name => {
                    const val = firstRow[name];
                    const type = (typeof val === 'number' || typeof val === 'bigint') ? 'DOUBLE' : 'VARCHAR';
                    return { name, type };
                });
                setSchema(prev => ({ ...prev, [l.id]: cols }));
            } else if (l.geoData && !l.data) {
                // Infer schema from GeoJSON feature properties
                const features = l.geoData.type === 'FeatureCollection' ? l.geoData.features :
                                 l.geoData.type === 'Feature' ? [l.geoData] : [];
                if (features.length > 0 && features[0].properties) {
                    const props = features[0].properties;
                    const cols = Object.keys(props).map(name => {
                        const val = props[name];
                        const type = (typeof val === 'number' || typeof val === 'bigint') ? 'DOUBLE' : 'VARCHAR';
                        return { name, type };
                    });
                    setSchema(prev => ({ ...prev, [l.id]: cols }));
                }
            } else if (l.dataset && !l.type.startsWith('user_upload')) {
                fetchingSchemas.current.add(l.id);
                fetch(`${API_BASE_URL}/schema?data_type=${l.type}&dataset=${l.dataset}`)
                    .then(res => {
                        if (!res.ok) return null;
                        return res.json();
                    })
                    .then(data => {
                        if (data) setSchema(prev => ({ ...prev, [l.id]: data.columns }));
                    })
                    .catch(() => {});
            }
        }
    });
  }, [layers, schema]);

  // Apply polygon filter to all spatial layers when polygon changes or new layers are added
  useEffect(() => {
      if (!polygonFeature) return;
      
      const layersToUpdate = layers.filter(l => {
          if (!l.isSpatial) return false;
          // check if polygon_filter is missing or different
          if (!l.filters?.polygon_filter || l.filters.polygon_filter.polygon !== polygonFeature) {
              return true;
          }
          return false;
      });

      layersToUpdate.forEach(l => {
          applyPolygonFilterToLayer(l.id, polygonFeature);
      });
  }, [polygonFeature, layers]);

  const applyPolygonFilterToLayer = (layerId: string, polygon: any) => {
      const layerConfig = layers.find(l => l.id === layerId);
      if (!layerConfig) return;

      const sourceData = layerConfig.data || [];
      const keys = sourceData.length > 0 ? Object.keys(sourceData[0]) : [];
      const latColReal = keys.find(h => ['Latitude', 'latitude', 'Lat', 'lat', 'y', 'Y'].includes(h)) || layerConfig.filters?.coords_lat || 'latitude';
      const lonColReal = keys.find(h => ['Longitude', 'longitude', 'Lon', 'lon', 'x', 'X', 'lng', 'Lng'].includes(h)) || layerConfig.filters?.coords_lon || 'longitude';

      const p = polygon.geometry.coordinates[0];
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      p.forEach((c: any) => {
          if (c[0] < minLon) minLon = c[0];
          if (c[0] > maxLon) maxLon = c[0];
          if (c[1] < minLat) minLat = c[1];
          if (c[1] > maxLat) maxLat = c[1];
      });

      const castLon = `TRY_CAST("${lonColReal}" AS DOUBLE)`;
      const castLat = `TRY_CAST("${latColReal}" AS DOUBLE)`;
      const bboxSql = `(${castLon} BETWEEN ${minLon} AND ${maxLon}) AND (${castLat} BETWEEN ${minLat} AND ${maxLat})`;

      let rayCastParts = [];
      for (let i = 0; i < p.length - 1; i++) {
          const x1 = p[i][0], y1 = p[i][1];
          const x2 = p[i+1][0], y2 = p[i+1][1];
          rayCastParts.push(`(((${y1} > ${castLat}) != (${y2} > ${castLat})) AND (${castLon} < (${x2} - ${x1}) * (${castLat} - ${y1}) / NULLIF((${y2} - ${y1}), 0) + ${x1}))::INT`);
      }
      
      const rayCastSql = `(${rayCastParts.join(' + ')}) % 2 = 1`;
      const sqlCond = `(${bboxSql}) AND (${rayCastSql})`;

      handleFilterChange(layerId, { ...layerConfig.filters, polygon_filter: { type: 'sql', sql: sqlCond, polygon } });
  };
  
  const handleToggleDrawing = () => {
      if (polygonFeature) {
          // Clear polygon
          setPolygonFeature(null);
          setIsDrawingPolygon(false);
          // Restore exact original data: remove polygon filter from all layers
          layers.forEach(l => {
              if (l.filters?.polygon_filter) {
                  const newFilters = { ...l.filters };
                  delete newFilters.polygon_filter;
                  handleFilterChange(l.id, newFilters);
              }
          });
      } else {
          setIsDrawingPolygon(prev => !prev);
      }
  };

  const labelSources = useMemo(() => {
    return layers.filter(l => l.visible && l.labelEnabled && l.labelField).map(l => {
      let features: any[] = [];
      
      const getCentroid = (geom: any): [number, number] | null => {
        if (!geom) return null;
        if (geom.type === 'Point') return geom.coordinates as [number, number];
        const flatten = (g: any): number[][] => {
          if (g.type === 'Point') return [g.coordinates];
          if (g.type === 'LineString' || g.type === 'MultiPoint') return g.coordinates;
          if (g.type === 'Polygon' || g.type === 'MultiLineString') return g.coordinates.flat();
          if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
          if (g.type === 'GeometryCollection') return g.geometries.flatMap(flatten);
          return [];
        };
        const coords = flatten(geom);
        if (coords.length === 0) return null;
        const sumLon = coords.reduce((s: number, c: number[]) => s + c[0], 0);
        const sumLat = coords.reduce((s: number, c: number[]) => s + c[1], 0);
        return [sumLon / coords.length, sumLat / coords.length];
      };

      if (l.geoData) {
        const rawFeatures = l.geoData.type === 'FeatureCollection' ? l.geoData.features :
                         l.geoData.type === 'Feature' ? [l.geoData] : [];
        
        features = rawFeatures.map((f: any) => {
           const pos = getCentroid(f.geometry);
           return pos ? {
             type: 'Feature',
             geometry: { type: 'Point', coordinates: pos },
             properties: { 
               label: String(f.properties?.[l.labelField!] || ''),
               ...f.properties
             }
           } : null;
        }).filter(Boolean);
      } else if (l.data) {
        const sourceData = l.filteredData || l.data;
        const filtered = filterData(sourceData, l.filters);
        features = filtered.map(d => {
            let lon = 0, lat = 0;
            if (l.filters?.coords_lon && l.filters?.coords_lat) {
                lon = parseFloat(d[l.filters.coords_lon] || 0);
                lat = parseFloat(d[l.filters.coords_lat] || 0);
            } else {
                lon = parseFloat(d.Longitude || d.longitude || d.Lon || d.lon || d.lng || d.Lng || d.x || d.X || 0);
                lat = parseFloat(d.Latitude || d.latitude || d.Lat || d.lat || d.y || d.Y || 0);
            }
            return {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lon, lat] },
              properties: {
                label: String(d[l.labelField!] || ''),
                ...d
              }
            };
        });
      }

      return {
        id: l.id,
        data: { type: 'FeatureCollection' as const, features },
        // Emit RGBA array directly — no CSS string, so TextLayer can consume it
        colorRgba: l.labelColor ? [...l.labelColor, 255] as [number,number,number,number] : [255, 255, 255, 255] as [number,number,number,number],
        size: l.labelSize || 14,
        pointSize: l.pointSize || 6
      };
    });
  }, [layers, scales]);

  const handleUploadData = (data: any[], filteredData: any[], name: string, coords: {lat: string, lon: string}, fileType: string, geoData?: any, duckdbTable?: string) => {
    const id = `upload_${name}_${Date.now()}`;
    const randomColors: [number, number, number][] = [
        [255, 120, 0], [0, 200, 100], [0, 120, 255], [255, 50, 50], [150, 0, 150]
    ];

    const hasGeoData = !!geoData;
    const isSpatial = hasGeoData || !!(coords.lat && coords.lon);

    // Create layer with in-memory data
    const newLayer: LayerConfig = {
      id,
      name,
      type: fileType === 'geojson' ? 'user_upload_geojson' : `user_upload_${fileType}`,
      dataset: name,
      visible: true,
      opacity: 0.9,
      color: randomColors[Math.floor(Math.random() * randomColors.length)],
      filters: {
          coords_lon: coords.lon || 'longitude',
          coords_lat: coords.lat || 'latitude'
      },
      data,
      filteredData,
      geoData,
      isSpatial,
      pointSize: 8,
      duckdbTable
    };

    setLayers(prev => [...prev, newLayer]);
    setIsCatalogOpen(false);

    // Zoom to bounds if spatial
    if (isSpatial) {
        let bounds: [number, number, number, number] | null = null;

        if (geoData) {
            // Function to get coords from any GeoJSON geometry
            const getCoords = (geom: any): number[][] => {
                if (!geom) return [];
                if (geom.type === 'Point') return [geom.coordinates];
                if (geom.type === 'LineString' || geom.type === 'MultiPoint') return geom.coordinates;
                if (geom.type === 'Polygon' || geom.type === 'MultiLineString') return geom.coordinates.flat();
                if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2);
                if (geom.type === 'GeometryCollection') return geom.geometries.flatMap(getCoords);
                return [];
            };

            const allCoords: number[][] = [];
            if (geoData.type === 'FeatureCollection') {
                geoData.features.forEach((f: any) => {
                    const coords = getCoords(f.geometry);
                    for (const c of coords) allCoords.push(c);
                });
            } else if (geoData.type === 'Feature') {
                const coords = getCoords(geoData.geometry);
                for (const c of coords) allCoords.push(c);
            } else {
                const coords = getCoords(geoData);
                for (const c of coords) allCoords.push(c);
            }

            if (allCoords.length > 0) {
                let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
                for (const [lon, lat] of allCoords) {
                    if (lon < minLon) minLon = lon;
                    if (lat < minLat) minLat = lat;
                    if (lon > maxLon) maxLon = lon;
                    if (lat > maxLat) maxLat = lat;
                }
                bounds = [minLon, minLat, maxLon, maxLat];
            }
        } else if (filteredData.length > 0) {
            let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
            let hasValid = false;
            for (const d of filteredData) {
                const lon = d[coords.lon];
                const lat = d[coords.lat];
                if (typeof lon === 'number' && typeof lat === 'number') {
                    if (lon < minLon) minLon = lon;
                    if (lat < minLat) minLat = lat;
                    if (lon > maxLon) maxLon = lon;
                    if (lat > maxLat) maxLat = lat;
                    hasValid = true;
                }
            }
            if (hasValid) {
                bounds = [minLon, minLat, maxLon, maxLat];
            }
        }

        if (bounds) {
            const [minLon, minLat, maxLon, maxLat] = bounds;
            const viewport = new WebMercatorViewport({
                width: window.innerWidth,
                height: window.innerHeight
            });
            
            // Add to session registry
            setUploadedDatasets(prev => {
                if (prev.find(d => d.name === name)) return prev;
                return [...prev, {
                    id,
                    name,
                    type: fileType,
                    rowCount: data.length,
                    bbox: bounds,
                    geometryType: geoData ? geoData.type : 'Point',
                    data,
                    filteredData,
                    coords,
                    geoData,
                    duckdbTable
                }];
            });

            try {
                const { longitude, latitude, zoom } = viewport.fitBounds(
                    [[minLon, minLat], [maxLon, maxLat]],
                    { padding: 100 }
                );
                setViewState(prev => ({
                    ...prev,
                    longitude,
                    latitude,
                    zoom: Math.min(zoom, 12), // Don't zoom in too far
                    transitionDuration: 1000
                }));
            } catch (e) {
                console.error("Failed to fit bounds", e);
            }
        }
    }
  };

  // Handle CSV data from chat interface "Add to Map" button
  const handleAddCsvToMap = useCallback((csvData: string, layerName: string) => {
    try {
      // Robust CSV parser that handles quoted fields
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              // Escaped quote
              current += '"';
              i++;
            } else {
              // Toggle quote state
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const lines = csvData.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        console.warn('[App] CSV has less than 2 lines, cannot parse');
        return;
      }
      
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
      const data: any[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCSVLine(lines[i]);
          // Allow rows with slight column mismatch (within 2 columns)
          if (Math.abs(values.length - headers.length) <= 2) {
            const row: any = {};
            headers.forEach((h, idx) => {
              let val = values[idx] || '';
              // Remove surrounding quotes if present
              val = val.replace(/^"|"$/g, '');
              // Try to parse as number for coordinate columns
              if (['Latitude', 'Longitude', 'latitude', 'longitude', 'Lat', 'Lon', 'lat', 'lon', 'x', 'y', 'X', 'Y'].includes(h)) {
                const num = parseFloat(val);
                row[h] = !isNaN(num) && isFinite(num) ? num : null;
              } else {
                row[h] = val;
              }
            });
            data.push(row);
          }
        } catch (lineError) {
          console.warn(`[App] Skipping malformed CSV line ${i}:`, lineError);
        }
      }
      
      if (data.length === 0) {
        console.warn('[App] No valid data rows parsed from CSV');
        return;
      }
      
      
      // Detect coordinate columns
      const latKeys = ['Latitude', 'latitude', 'Lat', 'lat', 'y', 'Y'];
      const lonKeys = ['Longitude', 'longitude', 'Lon', 'lon', 'x', 'X'];
      const latCol = headers.find(h => latKeys.includes(h)) || '';
      const lonCol = headers.find(h => lonKeys.includes(h)) || '';
      
      // Filter to valid spatial records with reasonable coordinate ranges
      const filteredData = latCol && lonCol 
        ? data.filter(d => {
            const lat = d[latCol];
            const lon = d[lonCol];
            return lat != null && lon != null && 
                   !isNaN(lat) && !isNaN(lon) &&
                   isFinite(lat) && isFinite(lon) &&
                   lat >= -90 && lat <= 90 &&
                   lon >= -180 && lon <= 180;
          })
        : data;
      
      
      const id = `chat_${layerName}_${Date.now()}`;
      const randomColors: [number, number, number][] = [
          [255, 120, 0], [0, 200, 100], [0, 120, 255], [255, 50, 50], [150, 0, 150]
      ];

      const newLayer: LayerConfig = {
        id,
        name: layerName,
        type: 'user_upload_chat',
        dataset: layerName,
        visible: true,
        opacity: 0.9,
        color: randomColors[Math.floor(Math.random() * randomColors.length)],
        filters: {
            coords_lon: lonCol,
            coords_lat: latCol
        },
        data,
        filteredData,
        vizField: undefined,
        isSpatial: !!(latCol && lonCol && filteredData.length > 0),
        pointSize: 8
      };

      setLayers(prev => [...prev, newLayer]);
      
      // Zoom to data extent if spatial
      if (filteredData.length > 0 && latCol && lonCol) {
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        let hasValid = false;
        for (const d of filteredData) {
            const lon = d[lonCol];
            const lat = d[latCol];
            if (typeof lon === 'number' && typeof lat === 'number') {
                if (lon < minLon) minLon = lon;
                if (lat < minLat) minLat = lat;
                if (lon > maxLon) maxLon = lon;
                if (lat > maxLat) maxLat = lat;
                hasValid = true;
            }
        }
        
        if (hasValid) {
          const centerLon = (minLon + maxLon) / 2;
          const centerLat = (minLat + maxLat) / 2;
          setViewState(prev => ({
            ...prev,
            longitude: centerLon,
            latitude: centerLat,
            zoom: 4,
            transitionDuration: 1000
          }));
        }
      }
    } catch (e) {
      console.error('[App] Failed to parse CSV for map:', e);
    }
  }, []);



  const handleAddDataset = (dataType: string, dataset: string, filters: any = {}) => {
    const id = `${dataType}_${dataset}_${Date.now()}`;
    const randomColors: [number, number, number][] = [
        [255, 120, 0], [0, 200, 100], [0, 120, 255], [255, 50, 50], [150, 0, 150]
    ];
    const newLayer: LayerConfig = {
      id,
      name: dataset,
      type: dataType,
      dataset,
      visible: true,
      opacity: 0.8,
      color: randomColors[Math.floor(Math.random() * randomColors.length)],
      filters: filters,
      isSpatial: true, // Internal datasets are assumed spatial
      pointSize: 6
    };
    setLayers(prev => [...prev, newLayer]);
    setIsCatalogOpen(false);
  };

  const handleRemoveLayer = (layerId: string) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
    setOpenTableLayerIds(prev => prev.filter(id => id !== layerId));
    if (activeTableLayerId === layerId) {
        setActiveTableLayerId(null);
    }
  };

  const handleLayerToggle = (layerId: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    ));
  };

  const handleLayerOpacity = (layerId: string, opacity: number) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, opacity } : layer
    ));
  };

  const handleLayerColor = (layerId: string, color: [number, number, number]) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, color } : layer
    ));
  };

  const handlePointSizeChange = (layerId: string, pointSize: number) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, pointSize } : layer
    ));
  };

  const handleStrokedChange = (layerId: string, stroked: boolean) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, stroked } : layer
    ));
  };

  const handleFilterChange = async (layerId: string, filters: any) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, filters } : layer
    ));
    
    // Proactively re-query DuckDB if it's a local database layer
    const layer = layers.find(l => l.id === layerId);
    if (layer?.duckdbTable) {
        const clauses: string[] = [];
        for (const [field, cond] of Object.entries(filters)) {
            if (!cond) continue;
            if (field === 'search') {
                const s = (cond as string).replace(/'/g, "''");
                clauses.push(`(Name ILIKE '%${s}%' OR Description ILIKE '%${s}%' OR dataset ILIKE '%${s}%')`);
            } else if (typeof cond === 'object') {
                const c = cond as any;
                if (c.type === 'range') {
                    if (c.min !== undefined && !isNaN(c.min)) clauses.push(`("${field}" >= ${c.min})`);
                    if (c.max !== undefined && !isNaN(c.max)) clauses.push(`("${field}" <= ${c.max})`);
                } else if (c.type === 'equals' && c.val !== undefined && c.val !== null) {
                    clauses.push(`("${field}" = '${c.val.toString().replace(/'/g, "''")}')`);
                } else if (c.type === 'contains' && c.val) {
                    clauses.push(`("${field}" ILIKE '%${c.val.toString().replace(/'/g, "''")}%')`);
                } else if (c.type === 'sql' && c.sql && field === 'polygon_filter') {
                    clauses.push(`(${c.sql})`);
                }
            }
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const sql = `SELECT * FROM ${layer.duckdbTable} ${where}`;
        handleSqlQuery(layerId, sql);
    }
  };

  const handleVizChange = (layerId: string, vizField?: string, palette?: string[], displayField?: string, tooltipFields?: string[]) => {
    setLayers(prev => prev.map(layer => {
        if (layer.id === layerId) {
            if (vizField !== layer.vizField || JSON.stringify(palette) !== JSON.stringify(layer.palette)) {
                setScales(prevScales => {
                    const next = { ...prevScales };
                    delete next[layerId];
                    return next;
                });
            }
            return { ...layer, vizField, palette, displayField: displayField ?? layer.displayField, tooltipFields: tooltipFields ?? layer.tooltipFields };
        }
        return layer;
    }));
  };

  const handleLineWidthChange = (layerId: string, width: number) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, lineWidth: width } : l));
  };

  const handleStrokeColorChange = (layerId: string, color: [number, number, number]) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, strokeColor: color } : l));
  };

  const handleLabelChange = (layerId: string, labelProps: Partial<Pick<LayerConfig, 'labelEnabled' | 'labelField' | 'labelSize' | 'labelColor'>>) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, ...labelProps } : l));
  };





  const handleSqlQuery = async (layerId: string, sql: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || !layer.duckdbTable) return;

    try {
        setLayers(prev => prev.map(l => l.id === layerId ? { ...l, isLoading: true, sqlQuery: sql } : l));
        
        const data = await queryDuckDB(sql);
        
        // Detect coordinates in new result set
        const columns = Object.keys(data[0] || {});
        const latKeys = ['Latitude', 'latitude', 'Lat', 'lat', 'y', 'Y'];
        const lonKeys = ['Longitude', 'longitude', 'Lon', 'lon', 'x', 'X', 'lng', 'Lng'];
        const latCol = columns.find(h => latKeys.includes(h)) || layer.filters?.coords_lat;
        const lonCol = columns.find(h => lonKeys.includes(h)) || layer.filters?.coords_lon;

        const filteredData = latCol && lonCol 
            ? data.filter((d: any) => {
                const lat = parseFloat(d[latCol]);
                const lon = parseFloat(d[lonCol]);
                return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
              })
            : data;

        setLayers(prev => prev.map(l => l.id === layerId ? { 
            ...l, 
            data, 
            filteredData, 
            isLoading: false,
            filters: {
                ...l.filters,
                coords_lat: latCol,
                coords_lon: lonCol
            }
        } : l));
    } catch (err: any) {
        console.error("SQL Query Error:", err);
        setLayers(prev => prev.map(l => l.id === layerId ? { ...l, isLoading: false } : l));
        alert(`SQL Error: ${err.message}`);
    }
  };

  const handleBulkToggle = (visible: boolean) => {
    setLayers(prev => prev.map(l => ({ ...l, visible })));
  };

  const handleBulkRemove = () => {
    setLayers([]);
    setOpenTableLayerIds([]);
    setActiveTableLayerId(null);
    setDetailWindows([]);
  };

  const handleZoomToLayer = useCallback((layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || !layer.isSpatial) return;

    let bounds: [number, number, number, number] | null = null;
    const sourceData = layer.filteredData || layer.data;

    if (layer.geoData) {
      const getCoords = (geom: any): number[][] => {
        if (!geom) return [];
        if (geom.type === 'Point') return [geom.coordinates];
        if (geom.type === 'LineString' || geom.type === 'MultiPoint') return geom.coordinates;
        if (geom.type === 'Polygon' || geom.type === 'MultiLineString') return geom.coordinates.flat(1);
        if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2);
        if (geom.type === 'GeometryCollection') return geom.geometries.flatMap(getCoords);
        return [];
      };

      const allCoords: number[][] = [];
      if (layer.geoData.type === 'FeatureCollection') {
        layer.geoData.features.forEach((f: any) => allCoords.push(...getCoords(f.geometry)));
      } else if (layer.geoData.type === 'Feature') {
        allCoords.push(...getCoords(layer.geoData.geometry));
      } else {
        allCoords.push(...getCoords(layer.geoData));
      }

      if (allCoords.length > 0) {
        const lons = allCoords.map(c => c[0]).filter(c => !isNaN(c));
        const lats = allCoords.map(c => c[1]).filter(c => !isNaN(c));
        if (lons.length > 0) {
          bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
        }
      }
    } else if (sourceData && sourceData.length > 0) {
      const latKeys = ['Latitude', 'latitude', 'Lat', 'lat', 'y', 'Y'];
      const lonKeys = ['Longitude', 'longitude', 'Lon', 'lon', 'x', 'X', 'lng', 'Lng'];
      
      const latCol = layer.filters?.coords_lat || Object.keys(sourceData[0]).find(k => latKeys.includes(k));
      const lonCol = layer.filters?.coords_lon || Object.keys(sourceData[0]).find(k => lonKeys.includes(k));

      if (latCol && lonCol) {
        const lats = sourceData.map(d => parseFloat(d[latCol])).filter(v => !isNaN(v));
        const lons = sourceData.map(d => parseFloat(d[lonCol])).filter(v => !isNaN(v));
        if (lats.length > 0 && lons.length > 0) {
          bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
        }
      }
    }

    if (bounds) {
      const [minLon, minLat, maxLon, maxLat] = bounds;
      
      // Handle single point case (min == max)
      if (minLon === maxLon && minLat === maxLat) {
        setViewState(prev => ({
          ...prev,
          longitude: minLon,
          latitude: minLat,
          zoom: 12,
          transitionDuration: 1000
        }));
        return;
      }

      try {
        const { longitude, latitude, zoom } = viewport.fitBounds(
          [[minLon, minLat], [maxLon, maxLat]],
          { padding: 100 }
        );
        setViewState(prev => ({
          ...prev,
          longitude,
          latitude,
          zoom: Math.min(zoom, 15),
          transitionDuration: 1000
        }));
      } catch (e) {
        console.error("Zoom to layer failed:", e);
      }
    }
  }, [layers, viewport]);

  const handleOpenTable = (layerId: string) => {
    setOpenTableLayerIds(prev => {
        if (prev.includes(layerId)) return prev;
        return [...prev, layerId];
    });
    setActiveTableLayerId(layerId);
    setShowTableOverlay(true);
  };

  const handleMapClick = useCallback((info: any) => {
    if (info.object) {
      const layer = layers.find(l => l.id === info.layer.id);
      
      // For GeoJSON features, the data is in 'properties'
      const isGeoJson = info.object.type === 'Feature';
      const properties = isGeoJson ? info.object.properties : info.object;
      
      let lon = 0;
      let lat = 0;

      if (info.coordinate) {
          [lon, lat] = info.coordinate;
      } else if (layer && layer.filters?.coords_lon && layer.filters?.coords_lat) {
          lon = parseFloat(properties[layer.filters.coords_lon] || 0);
          lat = parseFloat(properties[layer.filters.coords_lat] || 0);
      } else {
          lon = parseFloat(properties.Longitude || properties.longitude || properties.Lon || properties.lon || properties.lng || properties.Lng || properties.x || properties.X || 0);
          lat = parseFloat(properties.Latitude || properties.latitude || properties.Lat || properties.lat || properties.y || properties.Y || 0);
      }

      const newWindow: DetailWindowData = {
        id: `window-${Date.now()}`,
        x: Math.random() * (window.innerWidth - 450) + 50,
        y: Math.random() * (window.innerHeight - 350) + 50,
        width: 400,
        height: 300,
        data: properties,
        layerId: info.layer.id,
        lon,
        lat
      };
      setDetailWindows(prev => [...prev, newWindow]);
      setWindowPositions(prev => ({ 
        ...prev, 
        [newWindow.id]: { x: newWindow.x, y: newWindow.y, w: newWindow.width, h: newWindow.height } 
      }));
    }
  }, [layers]);

  const handleCloseWindow = (windowId: string) => {
    setDetailWindows(prev => prev.filter(w => w.id !== windowId));
  };

  const handleTableRowClick = (record: any) => {
    const lon = record.Longitude || record.longitude || record.Lon || record.lon || 0;
    const lat = record.Latitude || record.latitude || record.Lat || record.lat || 0;
    
    setViewState(prev => ({
      ...prev,
      longitude: parseFloat(lon),
      latitude: parseFloat(lat),
      zoom: 12,
      transitionDuration: 1000
    }));
    
    const newWindow: DetailWindowData = {
      id: `window-${Date.now()}`,
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 150,
      width: 400,
      height: 300,
      data: record,
      layerId: activeTableLayerId!,
      lon: parseFloat(lon),
      lat: parseFloat(lat)
    };
    setDetailWindows(prev => [...prev, newWindow]);
    setWindowPositions(prev => ({ 
      ...prev, 
      [newWindow.id]: { x: newWindow.x, y: newWindow.y, w: newWindow.width, h: newWindow.height } 
    }));
  };

  const toggle3D = () => {
    setViewState(prev => ({
      ...prev,
      pitch: prev.pitch === 0 ? 45 : 0,
      bearing: prev.pitch === 0 ? 30 : 0,
      transitionDuration: 500
    }));
  };

  const handleBaseMapChange = (style: string | any) => {
    setBaseMapStyle(style);
  };

  const createDeckLayers = () => {
    const deckLayers: any[] = [];
    
    layers.forEach(l => {
      if (!l.visible) return;
      
      if (l.type === 'raster') {
        const cogUrl = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/2020/S2A_31UCT_20200101_0_L2A/TCI.tif';
        deckLayers.push(
          new TileLayer({
            id: l.id,
            data: [`${API_BASE_URL}/raster/tiles/{z}/{x}/{y}.png?url=${encodeURIComponent(cogUrl)}`],
            maxZoom: 19,
            minZoom: 0,
            opacity: l.opacity,
            renderSubLayers: (props: any) => {
              const { bbox: {west, south, east, north} } = props.tile;
              return new BitmapLayer(props, {
                data: undefined,
                image: props.data,
                bounds: [west, south, east, north]
              });
            }
          })
        );
      } else if (l.geoData) {
        const geoScale = scales[l.id];
        const isLineGeom = l.geoData.type === 'LineString' || l.geoData.type === 'MultiLineString' ||
            (l.geoData.type === 'FeatureCollection' && l.geoData.features?.some((f: any) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'));

        deckLayers.push(new GeoJsonLayer({
          id: l.id,
          data: l.geoData,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: true,
          pointType: 'circle',
          
          // Point & Polygon Fill — use palette scale when available
          getPointRadius: l.pointSize || 8,
          getFillColor: (f: any) => {
              if (geoScale && l.vizField && f.properties) {
                  const val = f.properties[l.vizField];
                  if (val != null) {
                      const rgb = geoScale(val);
                      return [...rgb, 255 * l.opacity] as any;
                  }
              }
              return [...l.color, 255 * l.opacity] as any;
          },
          
          // Line Styling — use palette scale for line-type geometries
          getLineColor: (f: any) => {
              if (isLineGeom && geoScale && l.vizField && f.properties) {
                  const val = f.properties[l.vizField];
                  if (val != null) {
                      const rgb = geoScale(val);
                      return [...rgb, 255 * (l.opacity || 1)] as any;
                  }
              }
              if (l.strokeColor) return [...l.strokeColor, 255 * (l.opacity || 1)] as any;
              if (isLineGeom) return [...l.color, 255 * (l.opacity || 1)] as any;
              return [255, 255, 255, 255 * (l.opacity || 1)] as any;
          },
          getLineWidth: l.lineWidth || 2,
          
          updateTriggers: {
              getFillColor: [l.color, l.opacity, l.vizField, l.palette, geoScale],
              getLineColor: [l.color, l.strokeColor, l.opacity, l.vizField, l.palette, geoScale],
              getLineWidth: [l.lineWidth]
          },
          
          opacity: l.opacity,
          lineWidthMinPixels: 1,
          pointRadiusMinPixels: 2
        }));
      } else if (l.data && l.isSpatial) {
        const scale = scales[l.id];
        // Use filteredData (records with valid coordinates) for map visualization
        const sourceData = l.filteredData || l.data;
        const filteredData = filterData(sourceData, l.filters);

        deckLayers.push(new ScatterplotLayer({
          id: l.id,
          data: filteredData,
          pickable: true,
          opacity: l.opacity,
          stroked: l.stroked ?? true,
          filled: true,
          radiusScale: 1,
          radiusMinPixels: l.pointSize || 6,
          radiusMaxPixels: 100,
          lineWidthMinPixels: 1,
          getPosition: d => {
              // Priority 1: User upload detected coordinates
              if (l.filters?.coords_lon && l.filters?.coords_lat) {
                  return [parseFloat(d[l.filters.coords_lon] || 0), parseFloat(d[l.filters.coords_lat] || 0)];
              }
              // Priority 2: Standard naming patterns
              const lon = d.Longitude || d.longitude || d.Lon || d.lon || d.lng || d.Lng || d.x || d.X || 0;
              const lat = d.Latitude || d.latitude || d.Lat || d.lat || d.y || d.Y || 0;
              return [parseFloat(lon), parseFloat(lat)];
          },
          getFillColor: d => scale && l.vizField ? scale(d[l.vizField]) : l.color,
          getLineColor: [255, 255, 255, 150],
          onClick: handleMapClick,
          updateTriggers: {
            getFillColor: [l.vizField, l.palette, scale],
            data: l.data,
            filters: l.filters
          }
        }));
      }
    });

    if (isDrawingPolygon || polygonFeature) {
        deckLayers.push(
            new EditableGeoJsonLayer({
                id: 'polygon-draw-layer',
                data: polygonFeature ? { type: 'FeatureCollection', features: [polygonFeature] } : { type: 'FeatureCollection', features: [] },
                mode: isDrawingPolygon && !polygonFeature ? DrawPolygonMode : ViewMode,
                selectedFeatureIndexes: [],
                getFillColor: [37, 99, 235, 40],
                getLineColor: [37, 99, 235, 255],
                getLineWidth: 2,
                lineWidthMinPixels: 2,
                onEdit: (info: any) => {
                    const { updatedData, editType } = info;
                    if (editType === 'addFeature' && updatedData.features.length > 0) {
                        const feature = updatedData.features[updatedData.features.length - 1];
                        setPolygonFeature(feature);
                        setIsDrawingPolygon(false); // finish drawing upon adding the feature
                    }
                }
            } as any)
        );
    }

    // ── Text labels (Deck.gl TextLayer — no glyph server needed, works with any basemap) ──
    labelSources.forEach(s => {
      if (!s.data.features.length) return;
      const pixelOffset: [number, number] = [0, -((s.pointSize / 14 + 0.2) * s.size)];
      deckLayers.push(
        new TextLayer({
          id: `label-${s.id}`,
          data: s.data.features,
          getPosition: (f: any) => f.geometry.coordinates,
          getText: (f: any) => String(f.properties?.label ?? ''),
          getSize: s.size,
          getColor: s.colorRgba,
          getPixelOffset: pixelOffset,
          getAngle: 0,
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          fontFamily: '"Inter", "Noto Sans", system-ui, -apple-system, sans-serif',
          fontWeight: 'bold',
          // SDF mode enables halo (outline) rendering
          fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
          outlineWidth: 3,
          outlineColor: [0, 0, 0, 210],
          sizeScale: 1,
          sizeUnits: 'pixels',
          sizeMinPixels: 8,
          sizeMaxPixels: 64,
          pickable: false,
          billboard: true,
        })
      );
    });

    return deckLayers;
  };

  const activeLayersContext = useMemo(() => {
    return layers.filter(l => l.visible).map(l => {
      let cols: string[] = [];
      if (schema[l.id]) {
        cols = schema[l.id].map((c: any) => c.name);
      } else if (l.data && l.data.length > 0) {
        cols = Object.keys(l.data[0]);
      } else if (l.geoData) {
        const features = l.geoData.type === 'FeatureCollection' ? l.geoData.features : (l.geoData.type === 'Feature' ? [l.geoData] : []);
        if (features.length > 0 && features[0].properties) cols = Object.keys(features[0].properties);
      }
      return `Layer Name: '${l.name}' | Attributes: ${cols.length > 0 ? cols.join(', ') : 'none'}`;
    }).join('\n');
  }, [layers, schema]);

  return (
    <div className="app-layout bg-gray-900 font-sans">
      <div className="app-map-area">
      <DeckGL
        views={new MapView({ repeat: true })}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as any)}
        controller={{scrollZoom: true, dragPan: true, dragRotate: true}}
        layers={createDeckLayers()}
      >
        <Map
          mapStyle={baseMapStyle}
        />
        
        
        {/* Connector Lines SVG Layer */}
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-40 overflow-visible">
            {detailWindows.map(w => {
                const pos = windowPositions[w.id];
                if (!pos) return null;
                const [sx, sy] = viewport.project([w.lon, w.lat]);
                const tx = pos.x + pos.w / 2;
                const ty = pos.y + pos.h / 2;
                return (
                    <g key={`cable-${w.id}`}>
                        <path d={`M ${sx} ${sy} Q ${(sx+tx)/2} ${sy}, ${tx} ${ty}`} stroke="rgba(37, 99, 235, 0.2)" strokeWidth="4" fill="none" className="transition-all duration-300" />
                        <path d={`M ${sx} ${sy} Q ${(sx+tx)/2} ${sy}, ${tx} ${ty}`} stroke="rgba(37, 99, 235, 0.6)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" className="transition-all duration-300" />
                        <circle cx={sx} cy={sy} r="4" fill="#2563eb" className="animate-pulse" />
                    </g>
                );
            })}
        </svg>
      </DeckGL>

      <LayerManager
        layers={layers}
        onToggle={handleLayerToggle}
        onOpacityChange={handleLayerOpacity}
        onColorChange={handleLayerColor}
        onRemove={handleRemoveLayer}
        onOpenCatalog={() => setIsCatalogOpen(true)}
        onFilterChange={handleFilterChange}
        onOpenTable={handleOpenTable}
        onVizChange={handleVizChange}
        onPointSizeChange={handlePointSizeChange}
        onStrokedChange={handleStrokedChange}
        activeTableLayerId={activeTableLayerId || undefined}
        schema={schema}
        onBaseMapChange={handleBaseMapChange}
        baseMapStyle={baseMapStyle}

        onLineWidthChange={handleLineWidthChange}
        onStrokeColorChange={handleStrokeColorChange}

        onBulkToggle={handleBulkToggle}
        onBulkRemove={handleBulkRemove}
        onZoomToLayer={handleZoomToLayer}
        onLabelChange={handleLabelChange}
      />

      {/* ─── Top-Right Toolbar: Legend + Table + 3D ─── */}
      <div
        className="absolute top-3 z-50 flex flex-col gap-2 items-end transition-[right] duration-300 ease-in-out"
        style={{ right: isChatOpen ? 'calc(400px + 0.75rem)' : '0.75rem' }}
      >
        <button 
            onClick={handleToggleDrawing}
            className={`group flex items-center justify-center h-12 px-4 shadow-2xl transition-all border rounded-full backdrop-blur font-black uppercase text-[10px] tracking-wider
                ${polygonFeature || isDrawingPolygon 
                    ? 'bg-blue-600 border-blue-500 text-white hover:bg-red-500 hover:border-red-500' 
                    : 'bg-white/90 border-gray-100 text-blue-600 hover:bg-blue-50'}`}
            title="Polygon Filter"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10l5-7h8l5 7-9 11-9-11z" />
            </svg>
            {polygonFeature ? 'Clear Polygon' : (isDrawingPolygon ? 'Finish/Cancel' : 'Draw Polygon')}
        </button>

        <LegendPanel layers={layers} schema={schema} />

        {openTableLayerIds.length > 0 && !showTableOverlay && (
          <button 
            onClick={() => setShowTableOverlay(true)} 
            className="group flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur rounded-full shadow-2xl hover:bg-blue-50 transition-all border border-blue-100" 
            title="View Data Table"
          >
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>
        )}

        <button 
          onClick={toggle3D} 
          className="group flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur rounded-full shadow-2xl hover:bg-gray-100 transition-all border border-gray-100" 
          title="Toggle 2D/3D View"
        >
          <span className="text-[10px] font-black text-blue-600 transition-transform group-active:scale-90">{viewState.pitch === 0 ? '3D' : '2D'}</span>
        </button>
      </div>

      {showTableOverlay && openTableLayerIds.length > 0 && (
        <DataTable 
            layers={layers.filter(l => openTableLayerIds.includes(l.id))} 
            activeLayerId={activeTableLayerId || openTableLayerIds[0]}
            onRowClick={handleTableRowClick} 
            onTabChange={(id) => setActiveTableLayerId(id)}
            onCloseTab={(id) => {
                setOpenTableLayerIds(prev => prev.filter(tid => tid !== id));
                if (activeTableLayerId === id) setActiveTableLayerId(null);
            }}
            onCloseAll={() => {
                setShowTableOverlay(false);
            }} 
        />
      )}

      {isCatalogOpen && (
        <Catalog 
            onAddDataset={handleAddDataset} 
            onUploadData={handleUploadData} 
            onClose={() => setIsCatalogOpen(false)}
            uploadedDatasets={uploadedDatasets}
        />
      )}

      {detailWindows.map(window => {
        const layer = layers.find(l => l.id === window.layerId);
        return (
          <Rnd
            key={window.id}
            default={{ x: window.x, y: window.y, width: window.width, height: window.height }}
            minWidth={300}
            minHeight={250}
            onDrag={(_e, d) => setWindowPositions(prev => ({ ...prev, [window.id]: { ...prev[window.id], x: d.x, y: d.y } }))}
            onResize={(_e, _direction, ref, _delta, position) => {
                setWindowPositions(prev => ({ 
                    ...prev, 
                    [window.id]: { 
                        x: position.x, 
                        y: position.y, 
                        w: ref.offsetWidth, 
                        h: ref.offsetHeight 
                    } 
                }));
            }}
            className="absolute z-50 pointer-events-auto"
          >
            <DetailWindow
              data={window.data}
              datasetName={layer?.dataset}
              displayField={layer?.displayField}
              tooltipFields={layer?.tooltipFields}
              lat={window.lat}
              lon={window.lon}
              onClose={() => {
                handleCloseWindow(window.id);
                setWindowPositions(prev => {
                    const next = { ...prev };
                    delete next[window.id];
                    return next;
                });
              }}
            />
          </Rnd>
        );
      })}

      {/* Chat FAB — stays anchored inside the map area */}
      {!isChatOpen && (
        <div className="chat-fab" style={{ right: '1rem' }}>
          <button
            onClick={() => setIsChatOpen(true)}
            className="group flex items-center bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl px-5 py-3.5 shadow-2xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.03] active:scale-95 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <span className="ml-2 text-xs font-black uppercase tracking-widest">Assistant</span>
          </button>
        </div>
      )}

      {/* Attribution footer */}
      <div className="map-attribution-bar" style={{ right: isChatOpen ? '400px' : '0' }}>
        <span>© <a href="https://spatiotemporal.languagescience.jp/" target="_blank" rel="noopener noreferrer">Spatiotemporal Linguistics Project</a></span>
        <span className="mx-1.5 opacity-40">|</span>
        <span>Map © <a href="https://maplibre.org" target="_blank" rel="noopener noreferrer">MapLibre</a></span>
        <span className="mx-1.5 opacity-40">|</span>
        <span>Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></span>
        <span className="mx-1.5 opacity-40">|</span>
        <span><a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a></span>
      </div>

      </div>{/* end .app-map-area */}

      {/* Side panel — slides in from right */}
      <div className={`app-side-panel ${isChatOpen ? 'open' : ''}`}>
        <ChatInterface
          onAddToMap={handleAddCsvToMap}
          onStylePatch={(patchMsg) => {
            if (!patchMsg || !patchMsg.layername) return;
            const targetName = patchMsg.layername.replace(/^@/, '').toLowerCase();
            const targetLayer = layers.find(l => l.name.toLowerCase() === targetName || l.id === patchMsg.layername);
            if (!targetLayer) {
                console.warn('StylePatch layer not found:', patchMsg.layername);
                return;
            }
            
            const p = patchMsg.patch || {};
            
            let resolvedPalette = targetLayer.palette;
            if (p.palette !== undefined) {
                if (typeof p.palette === 'string') {
                    const palettes = getAllPalettes();
                    const matched = palettes.find(pal => pal.name.toLowerCase() === p.palette.toLowerCase());
                    if (matched) {
                        resolvedPalette = matched.colors;
                    } else {
                        console.warn('Palette not found:', p.palette);
                    }
                } else if (Array.isArray(p.palette)) {
                    resolvedPalette = p.palette;
                }
            }

            const newVizField = p.vizField !== undefined ? p.vizField : targetLayer.vizField;
            const scaleNeedsUpdate = newVizField !== targetLayer.vizField || JSON.stringify(resolvedPalette) !== JSON.stringify(targetLayer.palette);
            
            if (scaleNeedsUpdate) {
                setScales(prevScales => {
                    const next = { ...prevScales };
                    delete next[targetLayer.id];
                    return next;
                });
            }

            setLayers(prev => prev.map(layer => {
                if (layer.id === targetLayer.id) {
                    const updated = { ...layer };
                    if (p.vizField !== undefined || p.palette !== undefined) {
                        updated.vizField = newVizField;
                        updated.palette = resolvedPalette;
                    }
                    if (p.opacity !== undefined && p.opacity !== null) updated.opacity = parseFloat(p.opacity);
                    if (p.radius !== undefined && p.radius !== null) updated.pointSize = parseFloat(p.radius);
                    if (p.pointSize !== undefined && p.pointSize !== null) updated.pointSize = parseFloat(p.pointSize);
                    if (p.lineWidth !== undefined && p.lineWidth !== null) updated.lineWidth = parseFloat(p.lineWidth);
                    if (p.fillColor !== undefined && Array.isArray(p.fillColor) && p.fillColor.length >= 3) {
                        updated.color = [p.fillColor[0], p.fillColor[1], p.fillColor[2]];
                    }
                    if (p.visible !== undefined && p.visible !== null) {
                        updated.visible = Boolean(p.visible);
                    }
                    if (p.labelEnabled !== undefined && p.labelEnabled !== null) {
                        updated.labelEnabled = Boolean(p.labelEnabled);
                    }
                    if (p.labelField !== undefined) {
                        updated.labelField = p.labelField;
                    }
                    return updated;
                }
                return layer;
            }));
          }}
          onQueryPlan={(planMsg) => {
            if (!planMsg || !planMsg.layername || !planMsg.plan) return;
            const targetName = planMsg.layername.replace(/^@/, '').toLowerCase();
            const targetLayer = layers.find(l => l.name.toLowerCase() === targetName || l.id === planMsg.layername);
            if (!targetLayer) {
                console.warn('QueryPlan layer not found:', planMsg.layername);
                return;
            }
            const queryStr = planMsg.plan.query || planMsg.plan.sql;
            if (!queryStr) return;

            const _runQuery = (table: string) => {
                const sql = queryStr.replace(/FROM\s+["']?[a-zA-Z0-9_-]+["']?/i, `FROM ${table}`);
                queryDuckDB(sql).then((resultArr: any) => {
                    setLayers(prev => prev.map(layer => layer.id === targetLayer.id ? { ...layer, filteredData: resultArr } : layer));
                }).catch(e => console.error("DuckDB query failed:", e));
            };

            if (!targetLayer.duckdbTable) {
                if (targetLayer.data && targetLayer.data.length > 0) {
                    const tableName = `fly_${targetLayer.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const tmpFile = `${tableName}.json`;
                    
                    import('./utils/duckdb').then(({getDuckDB}) => {
                        getDuckDB().then(async ({db, conn}) => {
                            try {
                                const jsonContent = JSON.stringify(targetLayer.data);
                                await db.registerFileText(tmpFile, jsonContent);
                                await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_json_auto('${tmpFile}')`);
                                
                                setLayers(prev => prev.map(l => l.id === targetLayer.id ? { ...l, duckdbTable: tableName } : l));
                                _runQuery(tableName);
                            } catch(e) {
                                console.error('Failed to create DuckDB table dynamically:', e);
                            }
                        });
                    });
                    return;
                } else {
                    console.warn('Layer does not have an active DuckDB WASM table mapped and no data available:', targetLayer.name);
                    return;
                }
            }
            
            _runQuery(targetLayer.duckdbTable);
          }}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen(prev => !prev)}
          activeLayerNames={layers.filter(l => l.visible).map(l => l.name)}
          activeLayersContext={activeLayersContext}
        />
      </div>

    </div>
  );
}

export default App;