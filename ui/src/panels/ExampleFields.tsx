import { TextField } from "../fields";

/** Editors for a sample payload and its format (relationship or stage). */
export function ExampleFields({ example, format, onSave, testId, label = "Example data" }: { example: string; format: string; onSave(patch: { example?: string; format?: string }): void; testId?: string; label?: string }) {
  return (
    <>
      <TextField label="Data format" value={format} placeholder="e.g. JSON event, CSV row, SQL" onCommit={(v) => onSave({ format: v })} testId={testId && `${testId}-format`} />
      <TextField label={label} value={example} multiline rows={6} placeholder='e.g. {"user_id": 42, "event": "login"}' onCommit={(v) => onSave({ example: v })} testId={testId} />
    </>
  );
}
