import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@rideswithme/shared-types';
import type { PreparedFile } from './upload';

export interface PickedFile extends PreparedFile {
  name: string;
  /** Local URI for a preview (photos only). */
  previewUri: string | null;
}

export class PermissionDeniedError extends Error {}
export class FileTooLargeError extends Error {}

const MAX_EDGE = 1600;

/**
 * Photos are resized to at most 1600 px and saved as JPEG at 70% quality. A
 * phone photo of 4-8 MB becomes roughly 200-500 KB, which matters on prepaid
 * mobile data and weak signal, and is still sharp enough to read a licence.
 */
async function preparePhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  const body = await (await fetch(saved.uri)).blob();
  return {
    body,
    contentType: 'image/jpeg',
    sizeBytes: body.size,
    name: 'photo.jpg',
    previewUri: saved.uri,
  };
}

export async function takePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new PermissionDeniedError();
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled || !result.assets[0] ? null : preparePhoto(result.assets[0]);
}

export async function choosePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PermissionDeniedError();
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled || !result.assets[0] ? null : preparePhoto(result.assets[0]);
}

export async function choosePdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const body = await (await fetch(asset.uri)).blob();
  if (body.size > MAX_DOCUMENT_UPLOAD_BYTES) throw new FileTooLargeError();
  return {
    body,
    contentType: 'application/pdf',
    sizeBytes: body.size,
    name: asset.name,
    previewUri: null,
  };
}
