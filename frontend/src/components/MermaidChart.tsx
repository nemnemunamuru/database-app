import { useEffect, useRef } from "react";
import mermaid from "mermaid";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { Box, IconButton, Tooltip } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";

let _initialized = false;

interface Props {
  chart: string;
  darkMode?: boolean;
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <Box sx={{ display: "flex", gap: 0.5, mb: 1 }}>
      <Tooltip title="Zoom in">
        <IconButton size="small" onClick={() => zoomIn()}><ZoomInIcon /></IconButton>
      </Tooltip>
      <Tooltip title="Zoom out">
        <IconButton size="small" onClick={() => zoomOut()}><ZoomOutIcon /></IconButton>
      </Tooltip>
      <Tooltip title="Reset">
        <IconButton size="small" onClick={() => resetTransform()}><FitScreenIcon /></IconButton>
      </Tooltip>
    </Box>
  );
}

export default function MermaidChart({ chart, darkMode }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: darkMode ? "dark" : "default",
    });
    _initialized = true;
  }, [darkMode]);

  useEffect(() => {
    if (!_initialized || !ref.current) return;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!ref.current) return;
        ref.current.innerHTML = svg;
        // Make the SVG fill naturally without max-width cap
        const svgEl = ref.current.querySelector("svg");
        if (svgEl) {
          svgEl.removeAttribute("width");
          svgEl.removeAttribute("height");
          svgEl.style.width = "100%";
          svgEl.style.height = "auto";
          svgEl.style.maxWidth = "none";
          svgEl.style.minWidth = "1200px";
        }
      })
      .catch(console.error);
  }, [chart, darkMode]);

  const viewerHeight = "calc(100vh - 220px)";

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1,
        bgcolor: "background.paper",
        height: viewerHeight,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TransformWrapper
        minScale={0.1}
        maxScale={5}
        wheel={{ step: 0.006 }}
        doubleClick={{ disabled: false }}
        centerOnInit
      >
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
            <ZoomControls />
            <small style={{ color: "gray", marginLeft: 8 }}>
              Scroll to zoom · Drag to pan · Double-click to zoom in
            </small>
          </Box>
          <TransformComponent
            wrapperStyle={{ width: "100%", flexGrow: 1, overflow: "hidden", cursor: "grab" }}
          >
            <div ref={ref} />
          </TransformComponent>
        </>
      </TransformWrapper>
    </Box>
  );
}
