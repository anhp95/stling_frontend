export const filterData = (data: any[], filters: any) => {
    if (!filters) return data;
    return data.filter(d => {
        for (const [field, cond] of Object.entries(filters)) {
            if (!cond || (typeof cond !== 'object' && field !== 'search')) continue;
            
            if (field === 'search') {
                const search = (cond as string).toLowerCase();
                const nameMatch = (d.Name || d.name || '').toLowerCase().includes(search);
                const descMatch = (d.Description || d.description || '').toLowerCase().includes(search);
                if (!nameMatch && !descMatch) return false;
            } else {
                const c = cond as any;
                const val = d[field];
                if (c.type === 'range') {
                    if (val < c.min || val > c.max) return false;
                } else if (c.type === 'contains') {
                    if (!(val?.toString() || '').toLowerCase().includes(c.val.toLowerCase())) return false;
                } else if (c.type === 'equals') {
                    if (val?.toString() !== c.val?.toString()) return false;
                } else if (c.type === 'sql' && field === 'polygon_filter' && c.polygon) {
                    const p = c.polygon.geometry.coordinates[0];
                    let lon = 0, lat = 0;
                    if (d.Longitude !== undefined) { lon = parseFloat(d.Longitude); lat = parseFloat(d.Latitude); }
                    else if (d.longitude !== undefined) { lon = parseFloat(d.longitude); lat = parseFloat(d.latitude); }
                    else if (d.Lon !== undefined) { lon = parseFloat(d.Lon); lat = parseFloat(d.Lat); }
                    else if (d.lon !== undefined) { lon = parseFloat(d.lon); lat = parseFloat(d.lat); }
                    else if (d.lng !== undefined) { lon = parseFloat(d.lng); lat = parseFloat(d.lat); }
                    else if (d.x !== undefined) { lon = parseFloat(d.x); lat = parseFloat(d.y); }
                    else if (d.X !== undefined) { lon = parseFloat(d.X); lat = parseFloat(d.Y); }
                    
                    if (isNaN(lon) || isNaN(lat)) return false;
                    
                    let inside = false;
                    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
                        const xi = p[i][0], yi = p[i][1];
                        const xj = p[j][0], yj = p[j][1];
                        const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    if (!inside) return false;
                }
            }
        }
        return true;
    });
};
