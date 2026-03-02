import { BeanModel } from "redbean-node/dist/bean-model";
import { LooseObject } from "../../common/util-common";

export class ApiToken extends BeanModel {

    toJSON() : LooseObject {
        return {
            id: this.id,
            name: this.name,
            tokenPrefix: this.token_prefix,
            active: this.active,
            createdAt: this.created_at,
        };
    }

}

export default ApiToken;
