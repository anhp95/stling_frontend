import React from 'react';

interface DetailWindowProps {
  data: any;
  onClose: () => void;
  displayField?: string;
  datasetName?: string;
  tooltipFields?: string[];
  lat?: number;
  lon?: number;
}

const DetailWindow: React.FC<DetailWindowProps> = ({ data, onClose, displayField, datasetName, tooltipFields, lat, lon }) => {
  if (!data) return null;

  // Header resolution: Priority is displayField -> Name -> ID -> 'Details'
  const headerValue = displayField ? data[displayField] : (data.Name || data.name || data.ID || data.id || 'Record Details');

  const isMediaUrl = (val: any) => {
    if (typeof val !== 'string') return false;
    const lower = val.toLowerCase();
    return lower.startsWith('http') && (
        lower.includes('photo') || 
        lower.includes('image') || 
        lower.includes('picsum') ||
        /\.(jpg|jpeg|png|webp|gif|svg)$/.test(lower)
    );
  };

  const isVideoUrl = (val: any) => {
    if (typeof val !== 'string') return false;
    const lower = val.toLowerCase();
    return lower.startsWith('http') && (
        lower.includes('video') || 
        /\.(mp4|webm|ogg)$/.test(lower)
    );
  };

  // Extract media items
  const mediaUrls = Object.entries(data)
    .filter(([_, v]) => isMediaUrl(v))
    .map(([_, v]) => v as string);

  const videoUrls = Object.entries(data)
    .filter(([_, v]) => isVideoUrl(v))
    .map(([_, v]) => v as string);

  const renderValue = (v: any) => {
    if (v == null) return <span className="text-gray-300 italic">None</span>;
    if (typeof v === 'boolean') return <span>{v ? '✅ Yes' : '❌ No'}</span>;
    if (typeof v === 'number') return <span>{v.toLocaleString()}</span>;
    return <span>{String(v)}</span>;
  };

  // Exclude technical fields or fields already shown in header/media
  const excludeFields = ['geom', 'Latitude', 'Longitude', 'lat', 'lon', 'ID', 'id', 'Name', 'name', 'media_url', 'video_url', 'Media URL', 'Video URL'];
  if (displayField) excludeFields.push(displayField);

  return (
    <div className="h-full bg-white rounded-xl shadow-2xl flex flex-col border border-gray-100 overflow-hidden ring-1 ring-black/5">
      {/* Dynamic Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50/80 backdrop-blur-sm">
        <div className="min-w-0">
            <h3 className="text-sm font-black text-gray-800 truncate" title={String(headerValue)}>
                {String(headerValue)}
            </h3>
            {datasetName && (
                <p className="text-[9px] text-blue-600 font-bold uppercase tracking-widest mt-0.5">{datasetName}</p>
            )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-800 transition-colors bg-white shadow-sm border border-gray-100 rounded-full w-7 h-7 flex items-center justify-center text-lg font-bold ml-3"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white custom-scrollbar">
        {/* Media Gallery */}
        {(mediaUrls.length > 0 || videoUrls.length > 0) && (
            <div className="p-1 gap-1 grid grid-cols-1 bg-gray-100 border-b">
                {videoUrls.map((url, i) => (
                    <video key={i} src={url} controls className="w-full h-48 object-cover rounded bg-black" />
                ))}
                {mediaUrls.map((url, i) => (
                    <img key={i} src={url} alt="Media" className="w-full max-h-64 object-contain rounded bg-white shadow-inner" />
                ))}
            </div>
        )}

        {/* Dynamic Data Grid */}
        <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3">
                {Object.entries(data).map(([key, val]) => {
                    // Check if field is in tooltipFields if it exists
                    if (tooltipFields && !tooltipFields.includes(key)) return null;
                    
                    // Technical fields to always hide
                    const hardExclude = ['geom', 'dataset'];
                    if (hardExclude.includes(key)) return null;

                    // Only hide generic exclude fields if user hasn't explicitly selected them in tooltipFields
                    if (!tooltipFields && excludeFields.includes(key)) return null;
                    
                    if (isMediaUrl(val) || isVideoUrl(val)) return null;
                    return (
                        <div key={key} className="border-b border-gray-50 pb-2">
                            <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{key.replace(/_/g, ' ')}</h4>
                            <div className="text-[12px] text-gray-700 font-medium wrap-break-word leading-relaxed">
                                {renderValue(val)}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Coordinates Footer */}
            <div className="pt-4 mt-2 border-t border-dashed border-gray-100 flex justify-between items-center text-[10px] text-gray-400 font-mono">
                <span>COORD: {lat !== undefined ? lat.toFixed(5) : (data.Latitude || data.lat || '0')}°</span>
                <span>{lon !== undefined ? lon.toFixed(5) : (data.Longitude || data.lon || '0')}°</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default DetailWindow;