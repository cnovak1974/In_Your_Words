import { appMode, config } from "./config.js";

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  if (appMode === "mock") {
    const samples=8000/4, buffer=new ArrayBuffer(44+samples*2), view=new DataView(buffer);
    const write=(offset:number,value:string)=>[...value].forEach((char,i)=>view.setUint8(offset+i,char.charCodeAt(0)));
    write(0,"RIFF"); view.setUint32(4,36+samples*2,true); write(8,"WAVEfmt "); view.setUint32(16,16,true);
    view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,8000,true); view.setUint32(28,16000,true);
    view.setUint16(32,2,true); view.setUint16(34,16,true); write(36,"data"); view.setUint32(40,samples*2,true);
    return buffer;
  }
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenLabsModelId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs failed: ${response.status} ${await response.text()}`);
  }
  return response.arrayBuffer();
}
