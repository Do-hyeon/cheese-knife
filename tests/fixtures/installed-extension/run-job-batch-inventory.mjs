/** @param {unknown} actual @param {unknown} expected */
export function sameRunJobBatchInventory(actual,expected){
  if(!Array.isArray(actual)||!Array.isArray(expected)||actual.length!==expected.length)return false;
  const observed=[],required=[];
  for(let index=0;index<actual.length;index++){
    const observedName=actual[index],requiredName=expected[index];
    if(typeof observedName!=='string'||typeof requiredName!=='string')return false;
    observed.push(observedName);required.push(requiredName);
  }
  required.sort();
  return observed.sort().every((name,index)=>name===required[index]);
}
