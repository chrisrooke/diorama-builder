window.SNAPKIT = (function(){
var MIX=["cube","tetrahedron","pyramid","slope","slope-corner","dodecahedron","sphere","cylinder","cone"];
function snapshot(){
  var out={};
  MIX.forEach(function(shape){
    ["#object-layer","#shade-layer","#shadow-layer"].forEach(function(layer){
      var fig=document.querySelector(layer+" ."+shape);
      if(!fig){out[layer+" ."+shape]="MISSING";return;}
      var g=getComputedStyle(fig), parts=[g.transform];
      var faces=fig.querySelectorAll(":scope > .face");
      for(var i=0;i<faces.length;i++){
        var fg=getComputedStyle(faces[i]);
        parts.push(fg.display,fg.transform,fg.clipPath,fg.borderRadius,
          getComputedStyle(faces[i],"::before").backgroundImage,
          getComputedStyle(faces[i],"::before").backgroundColor,
          getComputedStyle(faces[i],"::before").transform,
          getComputedStyle(faces[i],"::after").display,
          getComputedStyle(faces[i],"::after").backgroundColor);
      }
      var cl=fig.querySelector(".curved-lighting");
      if(cl)parts.push(getComputedStyle(cl).transform,getComputedStyle(cl).display,
        getComputedStyle(cl,"::before").transform,getComputedStyle(cl,"::after").transform);
      var hl=fig.querySelector(".highlight");
      if(hl){var h=getComputedStyle(hl);parts.push(h.transform,h.top,h.left,h.width,h.height,h.backgroundColor,h.clipPath);}
      var tb=fig.querySelector(".top-bottom");
      if(tb)parts.push(getComputedStyle(tb,"::before").transform,getComputedStyle(tb,"::before").backgroundImage,
        getComputedStyle(tb,"::after").display,getComputedStyle(tb,"::after").backgroundImage);
      out[layer+" ."+shape]=parts.join(" | ");
    });
  });
  return out;
}
function pose(sx,sy,lx,ly,ox,oy,oz){
  var b=document.body.style;
  b.setProperty("--scene-x-unit",sx);b.setProperty("--scene-y-unit",sy);
  b.setProperty("--light-x-unit",lx);b.setProperty("--light-y-unit",ly);
  document.querySelectorAll(".object[data-object^=bench]").forEach(function(f){
    f.style.setProperty("--object-x-unit",ox);f.style.setProperty("--object-y-unit",oy);f.style.setProperty("--object-z-unit",oz);});
  document.body.getBoundingClientRect();
}
function both(){
  var o={};
  pose(-30,45,60,0,0,0,0); o["default"]=snapshot();
  pose(-12,137,73,-58,41,97,23); o["rotated"]=snapshot();
  return o;
}
function swap(href){
  var link=document.querySelector("link[rel=stylesheet]");
  var l=document.createElement("link"); l.rel="stylesheet"; l.href=href+"?v="+Date.now();
  document.head.appendChild(l);
  if(link) link.remove();
  document.body.getBoundingClientRect();
}
return {snapshot:snapshot,pose:pose,both:both,swap:swap,MIX:MIX};
})();
