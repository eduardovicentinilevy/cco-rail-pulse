import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { wsService } from '../services/websocket.service';

interface DataPoint {
  time: string;
  BRA: number;
  ITA: number;
}

interface TelemetryReading {
  currentStationCode: string;
  voltageKV?: number;
}

export const TSSChartWidget: React.FC = () => {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    const socket = wsService.connect();

    socket.on('telemetry:batch', (batch: TelemetryReading[]) => {
      const now = new Date();
      const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      const braData = batch.find((b) => b.currentStationCode === 'BRA')?.voltageKV || 24.5;
      const itaData = batch.find((b) => b.currentStationCode === 'ITA')?.voltageKV || 22.0;

      setData(prevData => {
        const newData = [...prevData, { time: timeLabel, BRA: braData, ITA: itaData }];
        // Buffer circular limitando a 15 pontos para manter performance do React
        return newData.length > 15 ? newData.slice(newData.length - 15) : newData;
      });
    });

    return () => {
      socket.off('telemetry:batch');
    };
  }, []);

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>📈 Telemetria de Tração (TSS) - Tempo Real</h3>
      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" vertical={false} />
            <XAxis dataKey="time" stroke="#A3A3A3" fontSize={10} tickMargin={10} />
            <YAxis domain={['auto', 'auto']} stroke="#A3A3A3" fontSize={10} tickFormatter={(val) => `${val}kV`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#141414', borderColor: '#2E2E2E', color: '#FFF', borderRadius: '8px' }}
              itemStyle={{ fontWeight: '600' }}
            />
            <Line type="monotone" name="Brasilândia (BRA)" dataKey="BRA" stroke="#FF6600" strokeWidth={3} dot={false} isAnimationActive={false} />
            <Line type="monotone" name="Itaberaba (ITA)" dataKey="ITA" stroke="#FF0000" strokeWidth={3} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '10px',
    padding: '1.25rem',
    marginTop: '1.5rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    fontFamily: 'var(--uni-font)'
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--uni-text-main)',
    marginTop: 0,
    marginBottom: '1rem'
  }
};