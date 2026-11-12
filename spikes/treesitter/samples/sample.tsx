import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from './Canvas';

export interface PanelProps {
  title: string;
  children?: ReactNode;
}

export type Tone = 'info' | 'warn';

const TONES: Record<Tone, string> = { info: 'blue', warn: 'orange' };

export function Panel({ title, children }: PanelProps) {
  const [open, setOpen] = useState(true);
  return (
    <section className="panel">
      <h2 onClick={() => setOpen(!open)}>{title}</h2>
      {open ? <div>{children}</div> : null}
    </section>
  );
}

export class Legend extends React.Component<{ tone: Tone }> {
  render() {
    return <span style={{ color: TONES[this.props.tone] }}>legend</span>;
  }
}

export default function App() {
  return (
    <Panel title="Diagram">
      <Canvas width={800} height={600} />
      <Legend tone="info" />
    </Panel>
  );
}
