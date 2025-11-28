export function length(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] +a[2] *a[2]) }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
export function normalize(a) {
	let l = length(a);
	return [a[0] / l, a[1] / l, a[2] / l];
}