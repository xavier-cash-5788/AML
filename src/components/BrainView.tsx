import React, { useState } from 'react';
import { useSystem } from '../engine/system';
import type { BrainZoneState } from '../engine/types';

// Définition géométrique simplifiée des zones pour le SVG
const ZONES_CONFIG = {
  prefrontal: { label: 'Cortex Préfrontal\n(Contrôle, ToM)', cx: 200, cy: 80, r: 55, color: '#3b82f6' }, // Bleu
  hippocampus: { label: 'Hippocampe\n(Mémoire, Sommeil)', cx: 160, cy: 160, r: 25, color: '#10b981' }, // Vert
  amygdala: { label: 'Amygdale\n(Émotion, Peur)', cx: 240, cy: 160, r: 20, color: '#ef4444' }, // Rouge
  striatum: { label: 'Striatum\n(Habitudes, RL)', cx: 200, cy: 210, r: 30, color: '#eab308' }, // Jaune
  temporal: { label: 'Cortex Temporal\n(Sémantique)', cx: 140, cy: 240, r: 40, color: '#a855f7' }, // Violet
};

export const BrainView: React.FC = () => {
  const system = useSystem();
  const [activeZoneName, setActiveZoneName] = useState<string | null>(null);
  const zones = system.brainZones;

  // Fonction pour calculer l'opacité et le glow selon l'intensité (0 à 1)
  const getStyle = (key: string, config: any) => {
    const state: BrainZoneState | undefined = zones[key as keyof typeof zones];
    const intensity = state?.intensity || 0;
    const isActive = intensity > 0.1;

    if (isActive) {
      setTimeout(() => setActiveZoneName(null), 1000); // Reset après animation
    }

    return {
      fill: config.color,
      fillOpacity: 0.2 + (intensity * 0.8), // De 0.2 à 1.0
      stroke: config.color,
      strokeWidth: isActive ? 3 : 1,
      filter: isActive ? 'drop-shadow(0 0 8px ' + config.color + ')' : 'none',
      transform: isActive ? 'scale(1.05)' : 'scale(1)',
      transformOrigin: `${config.cx}px ${config.cy}px`,
      transition: 'all 0.3s ease-out',
    };
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full bg-slate-900 text-white">
      <h2 className="text-2xl font-bold mb-6 text-cyan-400">Activité Cérébrale en Temps Réel</h2>
      
      <div className="relative w-full max-w-md aspect-square">
        <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-2xl">
          {/* Forme globale du cerveau (contour) */}
          <path 
            d="M100,200 C100,100 150,50 200,50 C250,50 300,100 300,200 C300,300 250,350 200,350 C150,350 100,300 100,200 Z" 
            fill="#1e293b" 
            stroke="#475569" 
            strokeWidth="2"
          />

          {/* Rendu des zones */}
          {Object.entries(ZONES_CONFIG).map(([key, config]) => {
            const style = getStyle(key, config);
            return (
              <g key={key} onMouseEnter={() => setActiveZoneName(key)} onMouseLeave={() => setActiveZoneName(null)}>
                <circle
                  cx={config.cx}
                  cy={config.cy}
                  r={config.r}
                  style={style}
                  className="cursor-pointer"
                />
                {/* Label texte simple si intensité > 0.3 */}
                {(zones[key as keyof typeof zones]?.intensity || 0) > 0.3 && (
                  <text
                    x={config.cx}
                    y={config.cy}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    pointerEvents="none"
                    className="drop-shadow-md"
                  >
                    {key.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Infobulle dynamique */}
        {activeZoneName && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur px-4 py-2 rounded-lg border border-white/20 text-center pointer-events-none z-10">
            <p className="font-bold text-cyan-300">{ZONES_CONFIG[activeZoneName as keyof typeof ZONES_CONFIG].label.split('\n')[0]}</p>
            <p className="text-xs text-gray-300">{ZONES_CONFIG[activeZoneName as keyof typeof ZONES_CONFIG].label.split('\n')[1]}</p>
            <p className="text-xs mt-1 text-yellow-400">
              Intensité: {Math.round((zones[activeZoneName as keyof typeof zones]?.intensity || 0) * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* Légende détaillée */}
      <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-md">
        {Object.entries(ZONES_CONFIG).map(([key, config]) => {
          const intensity = zones[key as keyof typeof zones]?.intensity || 0;
          return (
            <div key={key} className="flex items-center space-x-3 bg-slate-800 p-2 rounded border border-slate-700">
              <div 
                className="w-4 h-4 rounded-full shadow-lg" 
                style={{ backgroundColor: config.color, opacity: 0.2 + (intensity * 0.8) }}
              />
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-200">{key}</p>
                <div className="w-full bg-gray-700 h-1.5 rounded-full mt-1">
                  <div 
                    className="h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${intensity * 100}%`, backgroundColor: config.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
