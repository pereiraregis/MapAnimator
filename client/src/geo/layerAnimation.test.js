import { buildLayerCatalog, pinCollection, applyFeatureAnimation, applyRouteAnimation, colorAt, validateLayerAnimation, EMPTY_LAYER_ANIMATION } from './layerAnimation';
import { renderCollection, DEMO, DEFAULT_STYLE } from './features';
const pin={id:12,lng:-46,lat:-23,text:'Cidade',scale:1,opacity:1};
const feature={id:'area',name:'País',visible:true,style:{...DEFAULT_STYLE,color:'#1464c8'},feature:DEMO.features[0]};
test('catalog references stable object/property identities and leaves project values untouched',()=>{
 const before=JSON.stringify([pin,feature]);const catalog=buildLayerCatalog([pin],[feature],[[0,0],[1,1]],{pathColor:'#ff0000',pathWidth:5});
 expect(catalog.map(l=>l.id)).toEqual(['route','pin:12','feature:area']);expect(catalog[2].values).toMatchObject({red:20,green:100,blue:200});expect(JSON.stringify([pin,feature])).toBe(before);
});
test('pin frame overlays animate transforms and respect object/layer visibility without editing base data',()=>{
 const updates=[{id:'pin:12',visible:true,values:{lng:5,lat:6,opacity:.3,scale:2,rotation:45}}];const p=pinCollection([pin],updates).features[0];expect(p.geometry.coordinates).toEqual([5,6]);expect(p.properties).toMatchObject({iconSize:2,opacity:.3,rotation:45});expect(pin.lng).toBe(-46);
 expect(pinCollection([pin],[{...updates[0],visible:false}]).features).toHaveLength(0);expect(pinCollection([{...pin,visible:false}],updates).features).toHaveLength(0);
 expect(pinCollection([pin],updates,12).features[0].geometry.coordinates).toEqual([-46,-23]);
});
test('feature animation uses stable feature-state and clears its own overrides on deletion',()=>{
 const map={getSource:()=>({}),setFeatureState:jest.fn(),removeFeatureState:jest.fn()};applyFeatureAnimation(map,[feature],[{id:'feature:area',visible:false,values:{opacity:.2,width:9,red:220}}]);
 expect(map.setFeatureState).toHaveBeenCalledWith({source:'ma-features',id:'area'},{maVisible:false,maOpacity:.2,maWidth:9,maColor:'#dc64c8'});
 expect(renderCollection([feature]).features[0].id).toBe('area');applyFeatureAnimation(map,[feature],[]);expect(map.removeFeatureState).toHaveBeenCalledWith({source:'ma-features',id:'area'},'maColor');expect(feature.style.color).toBe('#1464c8');
});
test('route style resets to base when overrides are removed and color components clamp to RGB',()=>{
 const map={getLayer:()=>true,setPaintProperty:jest.fn()}, settings={pathColor:'#1464c8',pathWidth:5};applyRouteAnimation(map,[{id:'route',visible:false,values:{width:9,red:220}}],settings);expect(map.setPaintProperty).toHaveBeenCalledWith('route-line','line-color','#dc64c8');expect(map.setPaintProperty).toHaveBeenCalledWith('route-line','line-opacity',0);
 applyRouteAnimation(map,[],settings);expect(map.setPaintProperty).toHaveBeenLastCalledWith('route-line','line-color','#1464c8');expect(colorAt('#000000',{red:300,green:-1,blue:127.8})).toBe('#ff0080');
});
test('layer scene metadata validates native keys, constants, bounds and duplicate identities',()=>{
 const key={id:'key1',data:{time:0,value:{t:'Scalar',v:.5},in_interp:'Linear',out_interp:'Linear',in_ease:[],out_ease:[]}};const value={...EMPTY_LAYER_ANIMATION,constants:{'pin:12/scale':2},tracks:[{property:'pin:12/opacity',keys:[key]}]};expect(validateLayerAnimation(JSON.parse(JSON.stringify(value)))).toEqual(value);
 for(const invalid of [{...value,tracks:[...value.tracks,...value.tracks]},{...value,constants:{x:NaN}},{...value,tracks:[{property:'pin:12/opacity',keys:[key,key]}]},{...value,layers:[{id:'a',name:'A',kind:'pin',locked:false,muted:false,start:2,end:1}]}]) expect(()=>validateLayerAnimation(invalid)).toThrow();
});
import { syncFeatureLayers } from './layers';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
test('animated feature paint expressions validate against the installed MapLibre style specification',()=>{
 const sources={},layers=[];const map={getSource:id=>sources[id],isStyleLoaded:()=>true,addSource:(id,s)=>{sources[id]=s;},addLayer:l=>layers.push(l)};syncFeatureLayers(map,[feature]);
 expect(validateStyleMin({version:8,sources,layers})).toEqual([]);
});
