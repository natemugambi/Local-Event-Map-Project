function initMap() {
  // Coordinates for San Francisco
  const sanFrancisco = {
    lat: 37.7749,
    lng: -122.4194
  };

  // Creates a new Google Map
  const map = new google.maps.Map(document.getElementById("map"), {

    // Starting zoom level
    zoom: 12,

    // Center point of the map
    center: sanFrancisco,
  });

  // Creates a marker on the map
  const marker = new google.maps.Marker({

    // Marker location
    position: sanFrancisco,

    // Which map to place marker on
    map: map,

    // Text shown when clicking marker
    title: "San Francisco"
  });
}