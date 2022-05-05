import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, StatusBar, NativeModules, Dimensions, Text, StyleSheet, View, Image, ActivityIndicator, PermissionsAndroid, Platform } from 'react-native';
import Video, { LoadError, OnLoadData } from 'react-native-video';
import { SAFE_AREA_PADDING } from './Constants';
import { useIsForeground } from './hooks/useIsForeground';
import { PressableOpacity } from 'react-native-pressable-opacity';
import IonIcon from 'react-native-vector-icons/Ionicons';
import { Alert } from 'react-native';
import CameraRoll from '@react-native-community/cameraroll';
import { StatusBarBlurBackground } from './views/StatusBarBlurBackground';
import type { NativeSyntheticEvent } from 'react-native';
import type { ImageLoadEventData } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Routes } from './Routes';
import { useIsFocused } from '@react-navigation/core';
import ImageEditor, { ImageCropData } from "@react-native-community/image-editor";
import MlkitOcr from 'react-native-mlkit-ocr';

const requestSavePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (permission == null) return false;
  let hasPermission = await PermissionsAndroid.check(permission);
  if (!hasPermission) {
    const permissionRequestResult = await PermissionsAndroid.request(permission);
    hasPermission = permissionRequestResult === 'granted';
  }
  return hasPermission;
};

const isVideoOnLoadEvent = (event: OnLoadData | NativeSyntheticEvent<ImageLoadEventData>): event is OnLoadData =>
  'duration' in event && 'naturalSize' in event;

type Props = NativeStackScreenProps<Routes, 'MediaPage'>;
export function MediaPage({ navigation, route }: Props): React.ReactElement {
  const { path, type, width, height } = route.params;
  const [hasMediaLoaded, setHasMediaLoaded] = useState(false);
  const isForeground = useIsForeground();
  const isScreenFocused = useIsFocused();
  const isVideoPaused = !isForeground || !isScreenFocused;
  const [savingState, setSavingState] = useState<'none' | 'saving' | 'saved'>('none');

  const onMediaLoad = useCallback((event: OnLoadData | NativeSyntheticEvent<ImageLoadEventData>) => {
    if (isVideoOnLoadEvent(event)) {
      console.log(
        `Video loaded. Size: ${event.naturalSize.width}x${event.naturalSize.height} (${event.naturalSize.orientation}, ${event.duration} seconds)`,
      );
    } else {
      console.log(`Image loaded. Size: ${event.nativeEvent.source.width}x${event.nativeEvent.source.height}`);
    }
  }, []);
  const onMediaLoadEnd = useCallback(() => {
    console.log('media has loaded.');
    setHasMediaLoaded(true);
  }, []);
  const onMediaLoadError = useCallback((error: LoadError) => {
    console.log(`failed to load media: ${JSON.stringify(error)}`);
  }, []);

  const getImageSize = async (uri: string) => new Promise(resolve => {
    Image.getSize(uri, (width, height) => {
      resolve({ width, height });
    });
  });

  const timeout = (ms: any) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const [cropUri, setCropUri] = useState('');
  const [text, setText] = useState('');
  const isIOS = Platform.OS === 'ios';

  const onSavePressed = useCallback(async () => {
    try {
      setSavingState('saving');

      const hasPermission = await requestSavePermission();
      if (!hasPermission) {
        Alert.alert('Permission denied!', 'Vision Camera does not have permission to save the media to your camera roll.');
        return;
      }
      console.log(`file ban dau = file://${path}`);
      await CameraRoll.save(`file://${path}`, {
        type: type,
      });
      if (type === 'photo') {
        const imageSize: any = await getImageSize(`file://${path}`);
        const imageWidth = isIOS ? (imageSize?.width || 0) : width;
        const imageHeight = isIOS ? (imageSize?.height || 0) : height;
        console.log('imageSize?.width = ', imageSize?.width);
        console.log('imageSize?.height = ', imageSize?.height);
        console.log('width = ', width);
        console.log('height = ', height);

        const cropDataAndroid: ImageCropData = {
          offset: {x: imageWidth / 4, y: imageHeight / 4},
          size: {width: imageWidth / 2, height: imageHeight / 2},
          displaySize: {width: imageWidth / 2, height: imageHeight / 2},//{width: screenWidth / 2, height: screenHeight / 2},
          resizeMode: 'cover',
        };
        const cropData: ImageCropData = cropDataAndroid; //isIOS ? cropDataIos : cropDataAndroid;

        const uri = await ImageEditor.cropImage(`file://${path}`, cropData);
        console.log("Cropped image uri = ", uri);
        setCropUri(uri);
        const file = await CameraRoll.save(uri, {
          type: type,
        });
        const imageSize2: any = await getImageSize(file);
        const imageWidth2 = imageSize2?.width || 0;
        const imageHeight2 = imageSize2?.height || 0;
        console.log('imageWidth2 = ', imageWidth2);
        console.log('imageHeight2 = ', imageHeight2);
        // console.log('Save file sau khi crop = ', file);

        // await timeout(1000);
        const resultFromFile = await MlkitOcr.detectFromUri(uri);
        // console.log('MlkitOcr with resultFromFile = ', resultFromFile);
        if (resultFromFile) {
          const nextText = resultFromFile.map((item: any) => item?.text || '').join('\n');
          console.log('nextText = ', nextText);
          setText(nextText);
        }
    
      }

      setSavingState('saved');
    } catch (e) {
      const message = e instanceof Error ? e.message : JSON.stringify(e);
      setSavingState('none');
      Alert.alert('Failed to save!', `An unexpected error occured while trying to save your ${type}. ${message}`);
    }
  }, [path, type]);

  const source = useMemo(() => ({ uri: `file://${path}` }), [path]);

  const screenStyle = useMemo(() => ({ opacity: hasMediaLoaded ? 1 : 0 }), [hasMediaLoaded]);

  // const needFullStyle = isIOS ? StyleSheet.absoluteFill : {};
  // const {StatusBarManager} = NativeModules;
  // const top = isIOS ? screenHeight / 4 : screenHeight / 4// + StatusBarManager.HEIGHT / 2;
  return (
    <View style={[styles.container, screenStyle]}>
      <StatusBar hidden />
      {type === 'photo' && (
        <Image source={source} style={{ opacity: 0.7, width: screenWidth, height: screenHeight }} resizeMode="cover" onLoadEnd={onMediaLoadEnd} onLoad={onMediaLoad} />
      )}
      {type === 'photo' && cropUri.length > 0 && (
        <Image style={[{
          position: 'absolute',
          left: screenWidth / 4,
          top: screenHeight / 4,
          width: screenWidth / 2,
          height: screenHeight / 2,
          justifyContent: 'center',
          alignItems: 'center',
          // borderWidth: 1,
          // borderColor: 'red'
        }]}
        source={{ uri: cropUri}}
        resizeMode="cover"
         />
      )}
      {type === 'photo' && (
        <View style={{
          position: 'absolute',
          left: screenWidth / 4,
          top: screenHeight / 4,
          width: screenWidth / 2,
          height: screenHeight / 2,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'red'
        }} />
      )}
      {type === 'photo' && text.length > 0 && (
        <Text style={{
          position: 'absolute',
          left: screenWidth / 4,
          top: screenHeight / 4,
          width: screenWidth / 2,
          height: screenHeight / 2,
          justifyContent: 'center',
          alignItems: 'center',
          // borderWidth: 1,
          // borderColor: 'red',
          textAlign: 'center',
          color: 'yellow'
        }}>
          {text}
        </Text>
      )}
      {type === 'video' && (
        <Video
          source={source}
          style={StyleSheet.absoluteFill}
          paused={isVideoPaused}
          resizeMode="cover"
          posterResizeMode="cover"
          allowsExternalPlayback={false}
          automaticallyWaitsToMinimizeStalling={false}
          disableFocus={true}
          repeat={true}
          useTextureView={false}
          controls={false}
          playWhenInactive={true}
          ignoreSilentSwitch="ignore"
          onReadyForDisplay={onMediaLoadEnd}
          onLoad={onMediaLoad}
          onError={onMediaLoadError}
        />
      )}

      <PressableOpacity style={styles.closeButton} onPress={navigation.goBack}>
        <IonIcon name="close" size={35} color="white" style={styles.icon} />
      </PressableOpacity>

      <PressableOpacity style={styles.saveButton} onPress={onSavePressed} disabled={savingState !== 'none'}>
        {savingState === 'none' && <IonIcon name="download" size={35} color="white" style={styles.icon} />}
        {savingState === 'saved' && <IonIcon name="checkmark" size={35} color="white" style={styles.icon} />}
        {savingState === 'saving' && <ActivityIndicator color="white" />}
      </PressableOpacity>

      <StatusBarBlurBackground />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  closeButton: {
    position: 'absolute',
    top: SAFE_AREA_PADDING.paddingTop,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  saveButton: {
    position: 'absolute',
    bottom: SAFE_AREA_PADDING.paddingBottom,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  icon: {
    textShadowColor: 'black',
    textShadowOffset: {
      height: 0,
      width: 0,
    },
    textShadowRadius: 1,
  },
});
