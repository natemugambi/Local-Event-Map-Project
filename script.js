function initMap() {
  const center = { lat: 37.7749, lng: -122.4194 }; // change to your location if you want

  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: center,
  });

  // Example marker
  const marker = new google.maps.Marker({
    position: center,
    map: map,
    title: "Sample Event",
  });
}