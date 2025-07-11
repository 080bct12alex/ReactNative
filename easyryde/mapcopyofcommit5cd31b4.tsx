import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View, Image } from "react-native";
import MaplibreGL from "@maplibre/maplibre-react-native";

import { icons } from "@/constants";
import { useFetch } from "@/lib/fetch";
import {
  calculateDriverTimes,
  generateMarkersFromData,
} from "@/lib/map";
import { useDriverStore, useLocationStore } from "@/store";
import { Driver, MarkerData } from "@/types/type";
import Constants from "expo-constants";

const API_BASE_URL = Constants.expoConfig.extra?.apiUrl ?? "";
const directionsAPI = Constants.expoConfig.extra?.DIRECTIONS_API_KEY ?? "";
const maptilerKey = Constants.expoConfig.extra?.MAPTILER_API_KEY ?? "";
const rasterTileURL = `https://api.maptiler.com/maps/streets/256/{z}/{x}/{y}.png?key=${maptilerKey}`;


// Set up MapLibre
MaplibreGL.setAccessToken(null); // Not used with MapTiler raster
MaplibreGL.setConnected(true);

const Map = () => {
  const {
    userLongitude,
    userLatitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();

  const { selectedDriver, setDrivers } = useDriverStore();
  const { data: drivers, loading, error } = useFetch<Driver[]>(`${API_BASE_URL}/api/driver`);

  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);

  useEffect(() => {
    if (Array.isArray(drivers) && userLatitude && userLongitude) {
      const newMarkers = generateMarkersFromData({
        data: drivers,
        userLatitude,
        userLongitude,
      });
      setMarkers(newMarkers);
    }
  }, [drivers, userLatitude, userLongitude]);

  useEffect(() => {
    if (
      markers.length > 0 &&
      destinationLatitude !== undefined &&
      destinationLongitude !== undefined &&
      userLatitude !== undefined &&
      userLongitude !== undefined
    ) {
      calculateDriverTimes({
        markers,
        userLatitude,
        userLongitude,
        destinationLatitude,
        destinationLongitude,
      }).then((updatedDrivers) => {
        setDrivers(updatedDrivers as MarkerData[]);
      });

      (async () => {
        try {
          const res = await fetch(
            `https://maps.gomaps.pro/maps/api/directions/json?origin=${userLatitude},${userLongitude}&destination=${destinationLatitude},${destinationLongitude}&key=${directionsAPI}`
          );
          const data = await res.json();
          const polyline = data.routes?.[0]?.overview_polyline?.points;
          if (polyline) {
            const geojson = decodePolylineToGeoJSON(polyline);
            setRouteGeoJSON(geojson);
          }
        } catch (err) {
          console.error("Error fetching directions:", err);
          setRouteGeoJSON(null);
        }
      })();
    }
  }, [markers, destinationLatitude, destinationLongitude, userLatitude, userLongitude]);

  function decodePolylineToGeoJSON(encoded: string) {
    let index = 0, lat = 0, lng = 0;
    const coordinates: number[][] = [];

    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      coordinates.push([lng * 1e-5, lat * 1e-5]);
    }

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
    };
  }

  if (loading || (!userLatitude && !userLongitude)) {
    return (
      <View className="flex justify-center items-center w-full h-full">
        <ActivityIndicator size="small" color="#000" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex justify-center items-center w-full h-full">
        <Text>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MaplibreGL.MapView style={{ flex: 1 }}>
        <MaplibreGL.Camera
          zoomLevel={14}
          centerCoordinate={[userLongitude, userLatitude]}
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* ✅ Use RasterSource for MapTiler */}
        {maptilerKey ? (
  <MaplibreGL.RasterSource
    id="maptiler"
    tileSize={256}
    tiles={[rasterTileURL]}

  >
    <MaplibreGL.RasterLayer id="tile-layer" sourceID="maptiler" />
  </MaplibreGL.RasterSource>
) : (
  <Text style={{ position: 'absolute', top: 20, left: 10, color: 'red' }}>
    Missing MapTiler API key
  </Text>
)}


        {/* User Marker */}
        <MaplibreGL.PointAnnotation
          id="user-location"
          coordinate={[userLongitude, userLatitude]}
        >
          <View
            style={{
              width: 20,
              height: 20,
              backgroundColor: "#0286FF",
              borderRadius: 10,
              borderWidth: 3,
              borderColor: "white",
            }}
          />
        </MaplibreGL.PointAnnotation>

        {/* Driver Markers */}
        {markers.map((marker) => (
          <MaplibreGL.PointAnnotation
            key={marker.id.toString()}
            id={marker.id.toString()}
            coordinate={[marker.longitude, marker.latitude]}
          >
            <Image
              source={
                selectedDriver === +marker.id ? icons.selectedMarker : icons.marker
              }
              style={{ width: 30, height: 30 }}
              resizeMode="contain"
            />
          </MaplibreGL.PointAnnotation>
        ))}

        {/* Destination Marker */}
        {destinationLatitude && destinationLongitude && (
          <MaplibreGL.PointAnnotation
            id="destination"
            coordinate={[destinationLongitude, destinationLatitude]}
          >
            <Image
              source={icons.pin}
              style={{ width: 30, height: 30 }}
              resizeMode="contain"
            />
          </MaplibreGL.PointAnnotation>
        )}

        {/* Route Line */}
        {routeGeoJSON && (
          <MaplibreGL.ShapeSource id="routeSource" shape={routeGeoJSON}>
            <MaplibreGL.LineLayer
              id="routeLine"
              style={{
                lineColor: "#0286FF",
                lineWidth: 3,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </MaplibreGL.ShapeSource>
        )}
      </MaplibreGL.MapView>
    </View>
  );
};

export default Map;