import UserModel from '../models/user.model.js';

export async function listUsers(req, res, next){
  try {
    const items = await UserModel.listAll();
    return res.json({ success:true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req, res, next){
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success:false, message:'id requerido' });
    const item = await UserModel.getById(id);
    if (!item) return res.status(404).json({ success:false, message:'Usuario no encontrado' });
    return res.json({ success:true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next){
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success:false, message:'id requerido' });
    const updated = await UserModel.updateById(id, req.body || {});
    return res.json({ success:true, data: updated, message:'Usuario actualizado' });
  } catch (err) {
    if (err.message === 'No hay campos para actualizar'){
      return res.status(400).json({ success:false, message: err.message });
    }
    next(err);
  }
}
