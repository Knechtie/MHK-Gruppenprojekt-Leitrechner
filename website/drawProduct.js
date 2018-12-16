/*jshint esversion: 6  */

function drawProduct(drillParams, refElement, productSize, imageSizeFactor){
    var elem = document.getElementById(refElement);
    var two = new Two({ width: 100 * imageSizeFactor, height: 150 * imageSizeFactor }).appendTo(elem);

    var rect = two.makeRectangle(0, 0, 100 * imageSizeFactor, 150 * imageSizeFactor);
    var circle = [];
    const radius = 8 * imageSizeFactor;
    for (let index = 0; index < drillParams.length; index++) {   
      if (drillParams[index] == true){ 
        switch (index) {
          case 0:
            circle[index] = two.makeCircle(30 * imageSizeFactor, 50 * imageSizeFactor, radius);
            break;
          case 1:
            circle[index] = two.makeCircle(-30 * imageSizeFactor, 50 * imageSizeFactor, radius);
            break;
          case 2:
            circle[index] = two.makeCircle(0, 0, radius);
            break;
          case 3:
            circle[index] = two.makeCircle(30 * imageSizeFactor, -50 * imageSizeFactor, radius);
            break;
          case 4:
            circle[index] = two.makeCircle(-30 * imageSizeFactor, -50 * imageSizeFactor, radius);
            break;
        }  
      }
    }
  
    circle.forEach(element => {
      element.fill = '#2E3338';
      element.stroke = '#2E3338';
    });

    switch (productSize) {
        case 1:
        case "klein":
            rect.fill = 'rgba(0, 200, 255, 0.75)';
            rect.stroke = '#1C75BC';
            break;
        case 2:
        case "groß":
            rect.fill = 'rgba(255, 190, 118,0.75)';
            rect.stroke = 'rgba(240, 147, 43,1.0)';
            break;
        default:
            break;
    }
    
    var group = two.makeGroup(rect, circle[0], circle[1], circle[2], circle[3],circle[4]);
    
    // Skalierungsinformationen
    group.translation.set(two.width / 2, two.height / 2);
    group.rotation = Math.PI;
    group.scale = 0.75;
    group.linewidth = 7 * imageSizeFactor;
    two.update();
}