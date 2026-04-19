import PhotoWeatherTest from './PhotoWeatherTest';

const MOAB = { lat: 38.5733, lng: -109.5498, name: 'Moab, UT' };

export default function LightReportPreview() {
  return <PhotoWeatherTest previewMode initialLocation={MOAB} />;
}
