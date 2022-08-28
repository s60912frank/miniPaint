
import Base_stable_diffusion from './../../core/base-stable_diffusion';

class Tools_stable_diffusion_class {

	constructor() {
		this.Base_stable_diffusion = new Base_stable_diffusion();
	}

	connect_server() {
		this.Base_stable_diffusion.connect();
	}

	text_to_image() {
		this.Base_stable_diffusion.text_to_image();
	}

	image_to_image() {
		this.Base_stable_diffusion.image_to_image();
	}
}

export default Tools_stable_diffusion_class;