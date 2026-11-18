// Orientação da tela (18/11/2026): o EO fica em retrato; só a Escala em tela cheia libera a horizontal.
// expo-screen-orientation é nativo: entra junto com a compilação nova, e o Runtime muda com ele, então
// nenhuma OTA com este código chega a binários antigos.
import * as ScreenOrientation from "expo-screen-orientation";

export async function travarRetrato(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    // iPad em multitarefa e aparelhos sem suporte ignoram a trava.
  }
}

export async function liberarRotacao(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
  } catch {
    // Sem suporte: a tela cheia continua funcionando em retrato.
  }
}
